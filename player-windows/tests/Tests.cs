using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
namespace NarrowVision {
 public sealed class FakeApi:IPlayerApi {
  public int Calls;public bool LastUnpairAck;public Func<string,bool,Task<ApiReply>> Handler;
  public Task<ApiReply> Post(string route,Identity id,long revision,bool synced,string playlist,bool unpairAck,CancellationToken cancel){Calls++;LastUnpairAck=unpairAck;return Handler(route,unpairAck);}
 }
 public static class Tests {
  static int count;
  static void Check(bool ok,string name){if(!ok)throw new Exception(name);count++;Console.WriteLine("PASS "+name);}
  static string Root(string parent){string p=Path.Combine(parent,Guid.NewGuid().ToString());Directory.CreateDirectory(p);return p;}
  static Task<ApiReply> Result(ApiReply value){return Task.FromResult(value);}
  static Identity Paired(string root){var id=new Identity{device_uid=Guid.NewGuid().ToString(),player_id=Guid.NewGuid().ToString(),player_secret="unit-test-secret-not-a-real-credential"};new IdentityStore(root).Save(id);return id;}
  public static int Main(string[] args){try{Run(args[0]).GetAwaiter().GetResult();Console.WriteLine(count+" behavioral checks passed; no live backend calls.");return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
  static async Task Run(string parent){
   string root=Root(parent);var identities=new IdentityStore(root);var first=identities.Load();Check(identities.Load().device_uid==first.device_uid,"device UID survives restart");
   var id=Paired(root);Check(identities.Load().player_secret==id.player_secret,"DPAPI identity round trip");Check(!System.Text.Encoding.UTF8.GetString(File.ReadAllBytes(Path.Combine(root,"identity.dpapi"))).Contains(id.player_secret),"secret is not plaintext on disk");
   var s=new Schedule{active=true,days_of_week=new[]{1},start_time="09:00:00",end_time="17:00:00",timezone="Europe/Amsterdam",playlist_id="one"};
   Check(Planning.Active(s,new DateTime(2026,9,21,9,0,0)),"schedule includes start");Check(!Planning.Active(s,new DateTime(2026,9,21,17,0,0)),"schedule excludes end");Check(!Planning.Active(s,new DateTime(2026,9,22,10,0,0)),"schedule filters weekday");
   s.start_time="22:00:00";s.end_time="02:00:00";Check(Planning.Active(s,new DateTime(2026,9,21,23,0,0))&&Planning.Active(s,new DateTime(2026,9,22,1,0,0)),"overnight continues on following calendar day");Check(!Planning.Active(s,new DateTime(2026,9,21,1,0,0)),"overnight does not activate before configured day");
   Check(TimeZoneInfo.ConvertTime(new DateTimeOffset(2026,7,1,12,0,0,TimeSpan.Zero),Planning.Zone("Europe/Amsterdam")).Hour==14,"Amsterdam summer timezone");
   Check(TimeZoneInfo.ConvertTime(new DateTimeOffset(2026,1,1,12,0,0,TimeSpan.Zero),Planning.Zone("Europe/Amsterdam")).Hour==13,"Amsterdam winter timezone");
   var m=new Medium{media_id=Guid.NewGuid().ToString(),mime_type="image/png",updated_at="version-one",size_bytes=4,signed_url="https://evil.invalid/private"};
   bool rejected=false;try{MediaStore.SignedUri(m.signed_url);}catch(InvalidDataException){rejected=true;}Check(rejected,"foreign storage host rejected");
   rejected=false;try{MediaStore.SignedUri("http://"+Settings.Host+"/storage/v1/object/sign/a");}catch(InvalidDataException){rejected=true;}Check(rejected,"cleartext media rejected");
   rejected=false;try{MediaStore.FileKey(new Medium{media_id="../../escape",mime_type="image/png"});}catch(InvalidDataException){rejected=true;}Check(rejected,"path traversal rejected");
   string key=MediaStore.FileKey(m);m.updated_at="version-two";Check(key!=MediaStore.FileKey(m),"changed media gets separate cache generation");
   using(var cache=new MediaStore(root)){
    File.WriteAllBytes(cache.Local(m),new byte[]{1,2,3,4});
    var config=new ApiReply{config_revision=5,manifest=new Manifest{schedules=new[]{s},playlist_items=new PlaylistItem[0],media=new[]{m}}};
    await cache.Apply(config,CancellationToken.None);string disk=File.ReadAllText(Path.Combine(root,"snapshot.json"));Check(!disk.Contains("evil.invalid")&&!disk.Contains(id.player_secret),"snapshot excludes URL values and credentials");
    Check(cache.Load().revision==5,"offline snapshot durable");
    m.updated_at="failed-generation";rejected=false;try{await cache.Apply(new ApiReply{config_revision=6,manifest=config.manifest},CancellationToken.None);}catch(InvalidDataException){rejected=true;}
    Check(rejected&&cache.Load().revision==5,"failed download preserves previous snapshot");
   }
   var api=new FakeApi{Handler=(route,ack)=>{throw new System.Net.Http.HttpRequestException("offline");}};
   using(var engine=new PlayerEngine(root,api)){Check(engine.Snapshot!=null,"offline cold start restores snapshot");await engine.Sync(CancellationToken.None);Check(engine.Snapshot!=null&&engine.Identity.player_id==id.player_id,"network failure preserves playback and identity");}
   api=new FakeApi{Handler=(route,ack)=>{throw new ApiError(401);}};
   using(var engine=new PlayerEngine(root,api)){string oldUid=engine.Identity.device_uid;await engine.Sync(CancellationToken.None);Check(engine.Snapshot==null&&!engine.Identity.HasCredentials&&engine.Identity.device_uid!=oldUid,"401 wipes tenant data and rotates rejected identity");}
   id=Paired(root);
   api=new FakeApi{Handler=(route,ack)=>Result(route=="player-heartbeat"?new ApiReply{status="active",paired=true}:new ApiReply{config_revision=7,manifest=new Manifest{media=new Medium[0]}})};
   using(var engine=new PlayerEngine(root,api)){await engine.Sync(CancellationToken.None);Check(engine.Synced&&engine.Snapshot.revision==7&&!engine.Identity.denied,"authenticated recovery applies new snapshot");}
   api=new FakeApi{Handler=(route,ack)=>{throw new ApiError(403);}};
   using(var engine=new PlayerEngine(root,api)){await engine.Sync(CancellationToken.None);Check(engine.Snapshot==null&&engine.Identity.HasCredentials,"403 cannot fall back to unauthorized playback");}
   string fresh=Root(parent);api=new FakeApi{Handler=(route,ack)=>{throw new ApiError(409);}};
   using(var engine=new PlayerEngine(fresh,api)){string uid=engine.Identity.device_uid;await engine.Sync(CancellationToken.None);await engine.Sync(CancellationToken.None);Check(api.Calls==1&&engine.NeedsAttention&&uid==engine.Identity.device_uid,"ambiguous bootstrap stops without duplicate registration");}
   fresh=Root(parent);Paired(fresh);var pending=new TaskCompletionSource<ApiReply>();api=new FakeApi{Handler=(route,ack)=>pending.Task};
   using(var engine=new PlayerEngine(fresh,api)){var running=engine.Sync(CancellationToken.None);await engine.Sync(CancellationToken.None);Check(api.Calls==1,"concurrent sync requests are deduplicated");pending.SetResult(new ApiReply{status="pending"});await running;}
   fresh=Root(parent);api=new FakeApi{Handler=(route,ack)=>Result(new ApiReply{player_id=Guid.NewGuid().ToString(),player_secret="bootstrap-fixture-secret",pairing_code="ABCD1234EFGH",pairing_code_expires_at=DateTimeOffset.UtcNow.AddMinutes(10).ToString("o")})};
   using(var engine=new PlayerEngine(fresh,api)){await engine.Sync(CancellationToken.None);Check(new IdentityStore(fresh).Load().pairing_code=="ABCD1234EFGH","bootstrap credentials and code persisted together");}
   fresh=Root(parent);Paired(fresh);int phase=0;api=new FakeApi{Handler=(route,ack)=>{phase++;if(phase==1)return Result(new ApiReply{status="blocked",unpair_requested=true});if(phase==2)return Result(new ApiReply{status="pending",unpair_completed=true});return Result(new ApiReply{status="pending",pairing_code="NEWW1234CODE",pairing_code_expires_at=DateTimeOffset.UtcNow.AddMinutes(10).ToString("o")});}};
   bool stopped=false;using(var engine=new PlayerEngine(fresh,api,()=>stopped=true)){await engine.Sync(CancellationToken.None);Check(stopped&&phase==3&&engine.Identity.pairing_code=="NEWW1234CODE","requested unpair stops, wipes, acknowledges and immediately fetches pairing code");}
   fresh=Root(parent);Paired(fresh);api=new FakeApi{Handler=(route,ack)=>Result(new ApiReply{status="blocked",unpair_requested=false})};
   using(var engine=new PlayerEngine(fresh,api)){await engine.Sync(CancellationToken.None);Check(!api.LastUnpairAck&&engine.Identity.HasCredentials&&engine.Snapshot==null,"security block never acknowledges or re-registers");}
  }
 }
}
