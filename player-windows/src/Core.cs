using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace NarrowVision {
 public static class Settings {
  public const string Version="0.2.0-test";
  public const string Api="https://bqapbwsvfofgnfogwhdx.supabase.co/functions/v1/";
  public const string Host="bqapbwsvfofgnfogwhdx.supabase.co";
  public static string DataRoot { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NarrowVision","Player-TEST"); } }
 }
 public static class Json {
  public static T Read<T>(string text) { return new JavaScriptSerializer {MaxJsonLength=8*1024*1024}.Deserialize<T>(text); }
  public static string Write(object value) { return new JavaScriptSerializer {MaxJsonLength=8*1024*1024}.Serialize(value); }
 }
 public static class Disk {
  public static void Atomic(string path,byte[] bytes) {
   Directory.CreateDirectory(Path.GetDirectoryName(path));string tmp=path+".tmp";
   using(var f=new FileStream(tmp,FileMode.Create,FileAccess.Write,FileShare.None)){f.Write(bytes,0,bytes.Length);f.Flush(true);}
   if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
  }
  public static void Text(string path,string text){Atomic(path,Encoding.UTF8.GetBytes(text));}
 }
 public sealed class Identity {
  public string device_uid {get;set;} public string player_id {get;set;} public string player_secret {get;set;}
  public string pairing_code {get;set;} public string pairing_code_expires_at {get;set;} public bool denied {get;set;}
  public bool HasCredentials {get{return !String.IsNullOrEmpty(player_id)&&!String.IsNullOrEmpty(player_secret);}}
 }
 public sealed class IdentityStore {
  readonly string path;
  public IdentityStore(string root){path=Path.Combine(root,"identity.dpapi");}
  public Identity Load(){
   if(!File.Exists(path)){var fresh=new Identity{device_uid=Guid.NewGuid().ToString()};Save(fresh);return fresh;}
   // A corrupt/unreadable identity must never silently create a second player.
   return Json.Read<Identity>(Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(path),null,DataProtectionScope.CurrentUser)));
  }
  public void Save(Identity identity){Disk.Atomic(path,ProtectedData.Protect(Encoding.UTF8.GetBytes(Json.Write(identity)),null,DataProtectionScope.CurrentUser));}
  public void ClearRejectedIdentity(){if(File.Exists(path))File.Delete(path);}
 }
 public sealed class Schedule {
  public string id {get;set;} public string playlist_id {get;set;} public bool active {get;set;}
  public int[] days_of_week {get;set;} public string start_time {get;set;} public string end_time {get;set;} public string timezone {get;set;}
 }
 public sealed class PlaylistItem {
  public string id {get;set;} public string playlist_id {get;set;} public string media_id {get;set;}
  public int position {get;set;} public int duration_seconds {get;set;}
 }
 public sealed class Medium {
  public string media_id {get;set;} public string mime_type {get;set;} public string updated_at {get;set;}
  public long size_bytes {get;set;} public string signed_url {get;set;}
 }
 public sealed class Manifest {
  public Schedule[] schedules {get;set;} public PlaylistItem[] playlist_items {get;set;} public Medium[] media {get;set;}
 }
 public sealed class ApiReply {
  public string api_version {get;set;} public string player_id {get;set;} public string player_secret {get;set;}
  public string pairing_code {get;set;} public string pairing_code_expires_at {get;set;}
  public string status {get;set;} public bool paired {get;set;} public long config_revision {get;set;}
  public bool unpair_requested {get;set;} public bool unpair_completed {get;set;}
  public Manifest manifest {get;set;}
 }
 public sealed class ApiError:Exception {
  public readonly int Status; public ApiError(int status):base("Playerservice HTTP "+status){Status=status;}
 }
 public interface IPlayerApi {
  Task<ApiReply> Post(string route,Identity id,long revision,bool synced,string playlist,bool unpairAck,CancellationToken cancel);
 }
 public sealed class PlayerApi:IPlayerApi,IDisposable {
  readonly HttpClient client;
  readonly string manufacturer,model;
  public PlayerApi(){
   client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(25)};
   manufacturer="Windows";model=Environment.MachineName;
   try{using(var search=new System.Management.ManagementObjectSearcher("SELECT Manufacturer, Model FROM Win32_ComputerSystem"))foreach(var row in search.Get()){manufacturer=Convert.ToString(row["Manufacturer"]);model=Convert.ToString(row["Model"]);break;}}catch{}
  }
  public async Task<ApiReply> Post(string route,Identity id,long revision,bool synced,string playlist,bool unpairAck,CancellationToken cancel){
   if(route!="player-bootstrap"&&route!="player-heartbeat"&&route!="player-config")throw new ArgumentException("Unknown route");
   var body=new Dictionary<string,object>();
   if(route!="player-config"){
    body["device_uid"]=id.device_uid;body["platform"]="windows";body["manufacturer"]=manufacturer;body["model"]=model;
    body["os_version"]=Environment.OSVersion.Version.ToString();body["app_version"]=Settings.Version;
   }
   if(route=="player-heartbeat"){body["config_revision"]=revision;body["sync_succeeded"]=synced;body["current_playlist_id"]=playlist;if(unpairAck)body["unpair_ack"]=true;}
   using(var req=new HttpRequestMessage(HttpMethod.Post,Settings.Api+route)){
    req.Content=new StringContent(Json.Write(body),Encoding.UTF8,"application/json");
    req.Headers.TryAddWithoutValidation("User-Agent","NarrowVision-Windows-TEST/"+Settings.Version);
    if(id.HasCredentials){req.Headers.Add("X-Player-Id",id.player_id);req.Headers.Add("X-Player-Secret",id.player_secret);}
    else if(route!="player-bootstrap")throw new ApiError(401);
    using(var res=await client.SendAsync(req,cancel).ConfigureAwait(false)){
     if(!res.IsSuccessStatusCode)throw new ApiError((int)res.StatusCode);
     var reply=Json.Read<ApiReply>(await res.Content.ReadAsStringAsync().ConfigureAwait(false));
     if(reply==null||reply.api_version!="narrowvision-player-v1")throw new InvalidDataException("Unexpected player API version");
     return reply;
    }
   }
  }
  public void Dispose(){client.Dispose();}
 }
 public static class Planning {
  public static bool Active(Schedule s,DateTime local){
   TimeSpan start,end;
   if(!s.active||s.days_of_week==null||!TimeSpan.TryParse(s.start_time,out start)||!TimeSpan.TryParse(s.end_time,out end))return false;
   if(start<TimeSpan.Zero||start>=TimeSpan.FromDays(1)||end<TimeSpan.Zero||end>=TimeSpan.FromDays(1))return false;
   int day=(int)local.DayOfWeek;
   if(end>start)return s.days_of_week.Contains(day)&&local.TimeOfDay>=start&&local.TimeOfDay<end;
   // After midnight belongs to the previous configured day.
   int previous=(day+6)%7;
   return (s.days_of_week.Contains(day)&&local.TimeOfDay>=start)||(s.days_of_week.Contains(previous)&&local.TimeOfDay<end);
  }
  public static TimeZoneInfo Zone(string name){
   var aliases=new Dictionary<string,string>{{"Europe/Amsterdam","W. Europe Standard Time"},{"Europe/Berlin","W. Europe Standard Time"},{"Europe/Paris","Romance Standard Time"},{"Europe/Brussels","Romance Standard Time"},{"Europe/Madrid","Romance Standard Time"},{"Europe/London","GMT Standard Time"},{"UTC","UTC"},{"Etc/UTC","UTC"}};
   string mapped;if(aliases.TryGetValue(name??"Europe/Amsterdam",out mapped))name=mapped;
   return TimeZoneInfo.FindSystemTimeZoneById(name);
  }
  public static Schedule Select(Manifest manifest,DateTimeOffset now){
   return (manifest.schedules??new Schedule[0]).Where(s=>{try{return Active(s,TimeZoneInfo.ConvertTime(now,Zone(s.timezone)).DateTime);}catch{return false;}}).OrderBy(s=>s.start_time,StringComparer.Ordinal).FirstOrDefault();
  }
 }
 public sealed class Snapshot {
  public long revision {get;set;} public Manifest manifest {get;set;}
 }
 public sealed class MediaStore:IDisposable {
  readonly string root,manifestPath;readonly HttpClient client;
  public MediaStore(string dataRoot){root=Path.Combine(dataRoot,"media");manifestPath=Path.Combine(dataRoot,"snapshot.json");Directory.CreateDirectory(root);client=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromMinutes(10)};}
  public static bool Supported(Medium m){return m.mime_type=="image/jpeg"||m.mime_type=="image/png"||m.mime_type=="video/mp4";}
  public static string FileKey(Medium m){
   Guid id;if(!Guid.TryParseExact(m.media_id,"D",out id))throw new InvalidDataException("Invalid media id");
   string hash;using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes((m.updated_at??"")+"|"+m.mime_type))).Replace("-","").ToLowerInvariant();
   return id.ToString()+"-"+hash+(m.mime_type=="video/mp4"?".mp4":m.mime_type=="image/png"?".png":".jpg");
  }
  public string Local(Medium m){return Path.Combine(root,FileKey(m));}
  public static Uri SignedUri(string text){
   Uri uri;if(!Uri.TryCreate(text,UriKind.Absolute,out uri)||uri.Scheme!="https"||uri.Host!=Settings.Host||!uri.IsDefaultPort||!String.IsNullOrEmpty(uri.UserInfo)||!uri.AbsolutePath.StartsWith("/storage/v1/object/sign/",StringComparison.Ordinal))throw new InvalidDataException("Media URL is not TEST private storage");return uri;
  }
  public Snapshot Load(){try{if(File.Exists(manifestPath))return Json.Read<Snapshot>(File.ReadAllText(manifestPath));}catch{}return null;}
  public async Task<Snapshot> Apply(ApiReply config,CancellationToken cancel){
   if(config.manifest==null)throw new InvalidDataException("Manifest missing");
   foreach(var m in config.manifest.media??new Medium[0]){
    if(!Supported(m))throw new InvalidDataException("Unsupported media type");
    string path=Local(m);if(File.Exists(path)&&(m.size_bytes<=0||new FileInfo(path).Length==m.size_bytes))continue;
    Uri url=SignedUri(m.signed_url);string tmp=path+".download";
    try{
     using(var response=await client.GetAsync(url,HttpCompletionOption.ResponseHeadersRead,cancel).ConfigureAwait(false)){
      response.EnsureSuccessStatusCode();long count=0;var buffer=new byte[65536];
      using(var input=await response.Content.ReadAsStreamAsync().ConfigureAwait(false))using(var output=new FileStream(tmp,FileMode.Create,FileAccess.Write,FileShare.None)){
       int read;while((read=await input.ReadAsync(buffer,0,buffer.Length,cancel).ConfigureAwait(false))>0){count+=read;if(count>4L*1024*1024*1024)throw new InvalidDataException("Media exceeds 4 GiB");await output.WriteAsync(buffer,0,read,cancel).ConfigureAwait(false);}output.Flush(true);
      }
      if(count==0||(m.size_bytes>0&&count!=m.size_bytes)||(response.Content.Headers.ContentLength.HasValue&&count!=response.Content.Headers.ContentLength.Value))throw new InvalidDataException("Incomplete media");
     }
     if(File.Exists(path))File.Replace(tmp,path,null);else File.Move(tmp,path);
    }finally{if(File.Exists(tmp))File.Delete(tmp);}
   }
   // Sanitize before persistence; URLs and credentials never enter the snapshot.
   var clean=new Manifest{schedules=config.manifest.schedules,playlist_items=config.manifest.playlist_items,media=(config.manifest.media??new Medium[0]).Select(m=>new Medium{media_id=m.media_id,mime_type=m.mime_type,updated_at=m.updated_at,size_bytes=m.size_bytes}).ToArray()};
   var snapshot=new Snapshot{revision=config.config_revision,manifest=clean};Disk.Text(manifestPath,Json.Write(snapshot));
   var keep=new HashSet<string>((clean.media??new Medium[0]).Select(Local),StringComparer.OrdinalIgnoreCase);
   foreach(var file in Directory.GetFiles(root))if(!keep.Contains(file)&&!file.EndsWith(".download",StringComparison.OrdinalIgnoreCase))File.Delete(file);
   return snapshot;
  }
  public void ClearAll(){
   if(File.Exists(manifestPath))File.Delete(manifestPath);
   foreach(var file in Directory.GetFiles(root))File.Delete(file);
   if(File.Exists(manifestPath)||Directory.GetFiles(root).Length!=0)throw new IOException("Tenantcache kon niet volledig worden gewist");
  }
  public void Dispose(){client.Dispose();}
 }
 public sealed class PlayerEngine:IDisposable {
  readonly IPlayerApi api;readonly IdentityStore identities;readonly MediaStore media;readonly SemaphoreSlim gate=new SemaphoreSlim(1,1);
  readonly Action stopPlayback;
  public Identity Identity {get;private set;}public Snapshot Snapshot {get;private set;}
  public bool Online {get;private set;}public bool Synced {get;private set;}public bool NeedsAttention {get;private set;}
  public string Message {get;private set;} public string CurrentPlaylist;public int DelaySeconds=10;
  public PlayerEngine(string root,IPlayerApi client,Action stopBeforeWipe=null){api=client;stopPlayback=stopBeforeWipe??(()=>{});identities=new IdentityStore(root);media=new MediaStore(root);Identity=identities.Load();if(Identity.HasCredentials&&!Identity.denied)Snapshot=media.Load();Message="Player voorbereiden…";}
  public string MediaPath(Medium m){return media.Local(m);}
  public async Task Sync(CancellationToken cancel){
   if(!await gate.WaitAsync(0,cancel))return;
   try{
    if(!Identity.HasCredentials){
     if(NeedsAttention)return;
     var boot=await api.Post("player-bootstrap",Identity,0,false,null,false,cancel);
     Guid id;if(!Guid.TryParse(boot.player_id,out id)||String.IsNullOrEmpty(boot.player_secret))throw new InvalidDataException("Bootstrap credentials missing");
     Identity.player_id=boot.player_id;Identity.player_secret=boot.player_secret;Identity.pairing_code=boot.pairing_code;Identity.pairing_code_expires_at=boot.pairing_code_expires_at;identities.Save(Identity);
     Message="Wacht op koppeling…";
    }else{
     var heartbeat=await api.Post("player-heartbeat",Identity,Snapshot==null?0:Snapshot.revision,Synced,CurrentPlaylist,false,cancel);
     if(heartbeat.status=="active"&&heartbeat.paired){
      var config=await api.Post("player-config",Identity,0,false,null,false,cancel);
      var next=await media.Apply(config,cancel);Identity.denied=false;Identity.pairing_code=null;Identity.pairing_code_expires_at=null;identities.Save(Identity);
      Snapshot=next;Synced=true;Message="Verbonden";
     }else{
      ClearTenantContent();
      if(heartbeat.status=="blocked"&&heartbeat.unpair_requested){
       heartbeat=await api.Post("player-heartbeat",Identity,0,false,null,true,cancel);
       if(!heartbeat.unpair_completed)throw new InvalidDataException("Ontkoppeling is niet bevestigd");
       heartbeat=await api.Post("player-heartbeat",Identity,0,false,null,false,cancel);
      }
      Identity.denied=false;Identity.pairing_code=heartbeat.pairing_code;Identity.pairing_code_expires_at=heartbeat.pairing_code_expires_at;identities.Save(Identity);
      Message=heartbeat.status=="pending"?"Wacht op koppeling…":"Player beveiligd geblokkeerd · neem contact op met uw beheerder";
     }
    }
    Online=true;DelaySeconds=30;
   }catch(ApiError e){
    Online=false;Synced=false;
    if(e.Status==401){
     try{ClearTenantContent();identities.ClearRejectedIdentity();Identity=identities.Load();Message="Playeridentiteit ingetrokken · opnieuw registreren…";}
     catch{Message="Player geblokkeerd · lokale content wissen mislukt, opnieuw proberen…";}
    }
    else if(e.Status==403){
     try{ClearTenantContent();Identity.denied=true;identities.Save(Identity);Message="Toegang geweigerd · neem contact op met uw beheerder";}
     catch{Message="Player geblokkeerd · lokale content wissen mislukt, opnieuw proberen…";}
    }
    else if(e.Status==409){NeedsAttention=true;Message="Registratie bestaat al · herstel via uw beheerder";}
    else Message="Verbinding tijdelijk niet beschikbaar";
    DelaySeconds=e.Status==429?300:Math.Min(Math.Max(DelaySeconds,10)*2,300);
   }catch(OperationCanceledException){if(cancel.IsCancellationRequested)throw;Online=false;Synced=false;Message="Verbinding onderbroken · afspelen uit cache";DelaySeconds=Math.Min(Math.Max(DelaySeconds,10)*2,300);}
   catch(Exception){Online=false;Synced=false;Message="Verbinding onderbroken · afspelen uit cache";DelaySeconds=Math.Min(Math.Max(DelaySeconds,10)*2,300);}
   finally{gate.Release();}
  }
  void ClearTenantContent(){stopPlayback();Snapshot=null;Synced=false;CurrentPlaylist=null;media.ClearAll();}
  public void Dispose(){media.Dispose();var disposable=api as IDisposable;if(disposable!=null)disposable.Dispose();}
 }
}
