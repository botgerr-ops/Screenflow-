using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;

[assembly:AssemblyTitle("NarrowVision Player")]
[assembly:AssemblyVersion("0.2.1.0")]
[assembly:AssemblyFileVersion("0.2.1.0")]
namespace NarrowVision {
 public sealed class PairingScreen:Canvas {
  readonly TextBlock codeLabel,messageLabel,networkLabel,caption,footer;readonly Ellipse dot;readonly Button copy;
  string pairing="";
  public static Brush Brush(string hex){return new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));}
  public PairingScreen(){
   Width=1672;Height=941;Background=Brush("#030a1c");
   Text("NarrowVision Player",52,29,300,19,"#b3c4e5",false,false);
   dot=new Ellipse{Width=10,Height=10,Fill=Brush("#e7ba5b")};Place(dot,53,66);
   messageLabel=Text("Player voorbereiden…",74,60,650,17,"#b3c4e5",false,false);
   Text("v"+Settings.Version,1320,33,300,17,"#b3c4e5",false,false).TextAlignment=TextAlignment.Right;
   networkLabel=Text("Verbinding maken…",1170,63,450,16,"#b3c4e5",false,false);networkLabel.TextAlignment=TextAlignment.Right;
   Logo();
   Text("Koppel dit scherm aan uw account",250,283,1172,38,"#ffffff",true,true);
   Text("Ga naar uw NarrowVision omgeving en voeg een nieuwe player toe.",250,335,1172,22,"#b3c4e5",false,true);
   var card=new Border{Width=860,Height=182,CornerRadius=new CornerRadius(24),Background=Brush("#C009142e"),BorderBrush=new LinearGradientBrush((Color)ColorConverter.ConvertFromString("#9737ff"),(Color)ColorConverter.ConvertFromString("#518bff"),0),BorderThickness=new Thickness(1.5)};Place(card,406,398);
   caption=Text("U W   K O P P E L C O D E",426,424,820,18,"#b3c4e5",true,true);
   codeLabel=Text("Even geduld…",425,457,780,74,"#ffffff",true,true);codeLabel.FontFamily=new FontFamily("Consolas");
   copy=new Button{Content="⧉",Width=40,Height=40,FontSize=25,Foreground=Brush("#b567ff"),Background=Brush("#07112c"),BorderBrush=Brush("#55318d"),ToolTip="Koppelcode kopiëren",IsEnabled=false};Place(copy,1210,515);
   copy.Click+=(s,e)=>{try{if(!String.IsNullOrEmpty(pairing))Clipboard.SetText(pairing);}catch{}};
   string[] a={"Log in op uw","Ga naar","Kies Player toevoegen"};string[] b={"NarrowVision omgeving","Players","en vul de code in"};
   for(int i=0;i<3;i++){double x=411+i*315;var ring=new Ellipse{Width=42,Height=42,Stroke=Brush("#923bff"),StrokeThickness=3};Place(ring,x,619);Text((i+1).ToString(),x,621,42,26,"#c87aff",true,true);Text(a[i],x+61,613,270,18,"#b3c4e5",false,false);Text(b[i],x+61,640,275,18,"#ffffff",false,false);}
   footer=Text("De player start automatisch zodra de koppeling gereed is.",236,690,1200,17,"#b3c4e5",false,true);
   Text("Hulp nodig? Neem contact op met uw beheerder.",52,843,780,17,"#b3c4e5",false,false);
   Text("D I G I T A L   S I G N A G E",1170,838,450,12,"#b3c4e5",false,false).TextAlignment=TextAlignment.Right;
   Text("F O R   A   B R I G H T E R   T O M O R R O W",1170,862,450,12,"#b3c4e5",false,false).TextAlignment=TextAlignment.Right;
  }
  void Place(UIElement view,double x,double y){SetLeft(view,x);SetTop(view,y);Children.Add(view);}
  TextBlock Text(string text,double x,double y,double width,double size,string color,bool bold,bool center){var t=new TextBlock{Text=text,Width=width,FontSize=size,Foreground=Brush(color),FontFamily=new FontFamily("Segoe UI"),FontWeight=bold?FontWeights.SemiBold:FontWeights.Normal,TextAlignment=center?TextAlignment.Center:TextAlignment.Left};Place(t,x,y);return t;}
  void Logo(){
   var logo=new Canvas{Width=124,Height=110,RenderTransform=new ScaleTransform(1.12,1.12)};Place(logo,774,55);
   string[] paths={"M0,5 Q0,0 6,3 L36,22 36,75 6,95 Q0,99 0,92 Z","M74,20 L103,2 Q110,-2 110,5 L110,92 Q110,99 104,95 L74,75 Z","M0,5 L110,73 110,92 Q110,99 104,95 L0,29 Z"};
   string[] starts={"#368fff","#e84deb","#3679ff"},ends={"#21d4ff","#5625f3","#da42f3"};
   for(int i=0;i<3;i++)logo.Children.Add(new System.Windows.Shapes.Path{Data=Geometry.Parse(paths[i]),Fill=new LinearGradientBrush((Color)ColorConverter.ConvertFromString(starts[i]),(Color)ColorConverter.ConvertFromString(ends[i]),45)});
   var brand=Text("Narrow",550,163,301,53,"#ffffff",true,false);brand.TextAlignment=TextAlignment.Right;Text("Vision",851,163,280,53,"#9546ff",true,false);
   Text("S H O W   W H A T   M A T T E R S",536,232,600,14,"#b3c4e5",true,true);
  }
  public void Update(string code,string expires,string message,bool online){pairing=code??"";messageLabel.Text=message;networkLabel.Text=online?"Verbonden":"Offline · nieuwe poging volgt";dot.Fill=Brush(online?"#44eb9e":"#e7ba5b");RefreshCode();}
  void RefreshCode(){caption.Text="U W   K O P P E L C O D E";codeLabel.Text=String.IsNullOrEmpty(pairing)?"Even geduld…":System.Text.RegularExpressions.Regex.Replace(pairing,"(.{4})(?!$)","$1-");codeLabel.FontSize=pairing.Length==0?46:74;copy.IsEnabled=pairing.Length>0;footer.Text="De player start automatisch zodra de koppeling gereed is.";}
 }
 public sealed class PlayerWindow:Window {
  readonly PairingScreen pairing=new PairingScreen();readonly Grid root=new Grid(),surface=new Grid();readonly Viewbox pairingBox;
  readonly TextBlock playbackMessage=new TextBlock{Foreground=Brushes.White,FontSize=28,HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Center,TextAlignment=TextAlignment.Center};
  readonly CancellationTokenSource cancel=new CancellationTokenSource();readonly SemaphoreSlim wake=new SemaphoreSlim(0,1);
  readonly DispatcherTimer planningTimer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(15)},slideTimer=new DispatcherTimer();
  readonly PlayerEngine engine;Task loop;string fingerprint="";List<PlaylistItem> queue=new List<PlaylistItem>();int index;MediaElement video;bool closed;
  [DllImport("kernel32.dll")]static extern uint SetThreadExecutionState(uint flags);
  public PlayerWindow(){
   Title="NarrowVision Player";Background=Brushes.Black;Width=1280;Height=720;WindowStyle=WindowStyle.None;WindowState=WindowState.Maximized;
   pairingBox=new Viewbox{Child=pairing,Stretch=Stretch.Uniform};root.Background=PairingScreen.Brush("#030a1c");root.Children.Add(surface);root.Children.Add(pairingBox);Content=root;
   try{engine=new PlayerEngine(Settings.DataRoot,new PlayerApi(),StopForTenantWipe);}catch{pairing.Update("","","Lokale identiteit kan niet worden geopend · vraag uw beheerder",false);return;}
   Loaded+=(s,e)=>{SetThreadExecutionState(0x80000003);Evaluate();loop=RunLoop();planningTimer.Start();};
   NetworkChange.NetworkAvailabilityChanged+=NetworkChanged;
   planningTimer.Tick+=(s,e)=>Evaluate();slideTimer.Tick+=(s,e)=>Advance();
   KeyDown+=(s,e)=>{if(e.Key==Key.F11){WindowState=WindowState==WindowState.Maximized?WindowState.Normal:WindowState.Maximized;WindowStyle=WindowState==WindowState.Maximized?WindowStyle.None:WindowStyle.SingleBorderWindow;}if(e.Key==Key.Escape){WindowState=WindowState.Normal;WindowStyle=WindowStyle.SingleBorderWindow;}};
   Closed+=async(s,e)=>{closed=true;cancel.Cancel();planningTimer.Stop();StopMedia();NetworkChange.NetworkAvailabilityChanged-=NetworkChanged;SetThreadExecutionState(0x80000000);if(loop!=null)try{await loop;}catch{}engine.Dispose();};
  }
  void NetworkChanged(object s,NetworkAvailabilityEventArgs e){if(e.IsAvailable&&!closed)try{wake.Release();}catch(SemaphoreFullException){}}
  void StopForTenantWipe(){Action stop=()=>{StopMedia();queue.Clear();fingerprint="";surface.Children.Clear();pairingBox.Visibility=Visibility.Visible;};if(Dispatcher.CheckAccess())stop();else Dispatcher.Invoke(stop);}
  async Task RunLoop(){
   while(!cancel.IsCancellationRequested){
    try{await engine.Sync(cancel.Token);if(closed)return;pairing.Update(engine.Identity.pairing_code,engine.Identity.pairing_code_expires_at,engine.Message,engine.Online);Evaluate();await wake.WaitAsync(TimeSpan.FromSeconds(engine.DelaySeconds),cancel.Token);}catch(OperationCanceledException){break;}
   }
  }
  void Evaluate(){
   if(engine==null)return;
   if(engine.Snapshot==null){StopMedia();queue.Clear();fingerprint="";surface.Children.Clear();pairingBox.Visibility=Visibility.Visible;return;}
   pairingBox.Visibility=Visibility.Collapsed;
   var manifest=engine.Snapshot.manifest;var schedule=Planning.Select(manifest,DateTimeOffset.UtcNow);
   if(schedule==null){Empty("Geen actieve planning op dit moment.");return;}
   var media=(manifest.media??new Medium[0]).ToDictionary(m=>m.media_id);
   var next=(manifest.playlist_items??new PlaylistItem[0]).Where(i=>i.playlist_id==schedule.playlist_id&&media.ContainsKey(i.media_id)&&File.Exists(engine.MediaPath(media[i.media_id]))).OrderBy(i=>i.position).ToList();
   if(next.Count==0){Empty("De actieve afspeellijst bevat geen beschikbare media.");return;}
   string key=schedule.playlist_id+"|"+String.Join(";",next.Select(i=>MediaStore.FileKey(media[i.media_id])+":"+i.duration_seconds));engine.CurrentPlaylist=schedule.playlist_id;
   if(key==fingerprint&&queue.Count>0)return;fingerprint=key;queue=next;index=0;Render();
  }
  void Empty(string message){StopMedia();queue.Clear();fingerprint="";engine.CurrentPlaylist=null;surface.Children.Clear();playbackMessage.Text=message;surface.Children.Add(playbackMessage);}
  void StopMedia(){slideTimer.Stop();if(video!=null){video.Stop();video.Close();video=null;}}
  void Advance(){if(queue.Count==0)return;index=(index+1)%queue.Count;Render();}
  void Render(){
   StopMedia();surface.Children.Clear();if(queue.Count==0||engine.Snapshot==null)return;
   var item=queue[index];var medium=engine.Snapshot.manifest.media.First(m=>m.media_id==item.media_id);string path=engine.MediaPath(medium);
   try{
    if(medium.mime_type.StartsWith("image/")){
     var bitmap=new BitmapImage();bitmap.BeginInit();bitmap.CacheOption=BitmapCacheOption.OnLoad;bitmap.UriSource=new Uri(path);bitmap.EndInit();bitmap.Freeze();surface.Children.Add(new Image{Source=bitmap,Stretch=Stretch.UniformToFill});slideTimer.Interval=TimeSpan.FromSeconds(Math.Max(1,item.duration_seconds));slideTimer.Start();
    }else{
     video=new MediaElement{LoadedBehavior=MediaState.Manual,UnloadedBehavior=MediaState.Manual,Stretch=Stretch.UniformToFill,Source=new Uri(path)};video.MediaEnded+=(s,e)=>Advance();video.MediaFailed+=(s,e)=>{slideTimer.Interval=TimeSpan.FromSeconds(2);slideTimer.Start();};surface.Children.Add(video);video.Play();
    }
   }catch{slideTimer.Interval=TimeSpan.FromSeconds(2);slideTimer.Start();}
  }
 }
 public static class Program {
  [STAThread] public static int Main(string[] args){
   ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
   if(args.Length==2&&args[0]=="--render-preview"){
    var screen=new PairingScreen();screen.Update("7K4P92AB6CDE",DateTimeOffset.UtcNow.AddMinutes(10).ToString("o"),"Wacht op koppeling…",true);
    screen.Measure(new Size(1672,941));screen.Arrange(new Rect(0,0,1672,941));screen.UpdateLayout();var bitmap=new RenderTargetBitmap(1672,941,96,96,PixelFormats.Pbgra32);bitmap.Render(screen);var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(bitmap));using(var stream=File.Create(args[1]))png.Save(stream);return 0;
   }
   bool created;using(var mutex=new Mutex(true,"Local\\NarrowVision.Player.TEST",out created)){
    if(!created)return 0;
    var app=new Application();app.DispatcherUnhandledException+=(s,e)=>{MessageBox.Show("De player kon niet doorgaan. Sluit de app en vraag uw beheerder om hulp.","NarrowVision Player");e.Handled=true;app.Shutdown(1);};return app.Run(new PlayerWindow());
   }
  }
 }
}
