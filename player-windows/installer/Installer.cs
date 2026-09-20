using System;
using System.IO;
using System.Reflection;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
namespace NarrowVisionSetup {
 public static class Program {
  static string InstallRoot {get{return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Programs","NarrowVision Player TEST");}}
  static void Extract(string root){Directory.CreateDirectory(root);string current=Path.Combine(root,"NarrowVision-Player.exe");using(var input=Assembly.GetExecutingAssembly().GetManifestResourceStream("player.exe"))using(var output=File.Create(current))input.CopyTo(output);string legacy=Path.Combine(root,"NarrowVision-Player-TEST.exe");if(File.Exists(legacy))File.Delete(legacy);}
  static string Quote(string value){return "'"+value.Replace("'","''")+"'";}
  static void Shortcut(string path,string exe){dynamic shell=Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));dynamic link=shell.CreateShortcut(path);link.TargetPath=exe;link.WorkingDirectory=Path.GetDirectoryName(exe);link.Description="NarrowVision TEST player";link.Save();}
  static void Install(bool autostart){
   string root=InstallRoot,exe=Path.Combine(root,"NarrowVision-Player.exe");
   Extract(root);string shortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"NarrowVision Player.lnk");string legacyShortcut=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs),"NarrowVision Player TEST.lnk");if(File.Exists(legacyShortcut))File.Delete(legacyShortcut);Shortcut(shortcut,exe);
   using(var run=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")){if(autostart)run.SetValue("NarrowVisionPlayerTEST","\""+exe+"\"");else run.DeleteValue("NarrowVisionPlayerTEST",false);}
   string uninstall=Path.Combine(root,"Uninstall.ps1");
   string script="$ErrorActionPreference = 'Stop'\r\n$target = "+Quote(root)+"\r\nif ([IO.Path]::GetFullPath($PSScriptRoot) -ne [IO.Path]::GetFullPath($target)) { throw 'Unexpected install directory' }\r\nRemove-Item -LiteralPath "+Quote(exe)+" -ErrorAction SilentlyContinue\r\nRemove-Item -LiteralPath "+Quote(shortcut)+" -ErrorAction SilentlyContinue\r\nRemove-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'NarrowVisionPlayerTEST' -ErrorAction SilentlyContinue\r\nRemove-Item -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NarrowVisionPlayerTEST' -ErrorAction SilentlyContinue\r\nRemove-Item -LiteralPath $PSCommandPath\r\nRemove-Item -LiteralPath $target -ErrorAction SilentlyContinue\r\n# Player identity and cached content are preserved.\r\n";
   File.WriteAllText(uninstall,script);
   using(var key=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\NarrowVisionPlayerTEST")){
    key.SetValue("DisplayName","NarrowVision Player");key.SetValue("DisplayVersion","0.2.0-test");key.SetValue("Publisher","NarrowVision");key.SetValue("InstallLocation",root);key.SetValue("UninstallString","powershell.exe -NoProfile -ExecutionPolicy Bypass -File \""+uninstall+"\"");key.SetValue("NoModify",1);key.SetValue("NoRepair",1);
   }
  }
  [STAThread]public static int Main(string[] args){
   if(args.Length==2&&args[0]=="--extract"){Extract(Path.GetFullPath(args[1]));return 0;}
   var app=new Application();var win=new Window{Title="NarrowVision Player installeren",Width=570,Height=340,ResizeMode=ResizeMode.NoResize,WindowStartupLocation=WindowStartupLocation.CenterScreen};
   var panel=new StackPanel{Margin=new Thickness(28)};panel.Children.Add(new TextBlock{Text="NarrowVision Player",FontSize=25,FontWeight=FontWeights.SemiBold});panel.Children.Add(new TextBlock{Text="Installeert de Windows-player voor het TEST-platform.\nUw bestaande playergegevens blijven behouden.\n\nLocatie: "+InstallRoot,TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,15,0,15)});
   var auto=new CheckBox{Content="Player automatisch starten na Windows-aanmelding",IsChecked=true};panel.Children.Add(auto);
   var status=new TextBlock{Margin=new Thickness(0,12,0,8),TextWrapping=TextWrapping.Wrap};panel.Children.Add(status);
   var install=new Button{Content="Installeren",Padding=new Thickness(20,8,20,8),HorizontalAlignment=HorizontalAlignment.Right};panel.Children.Add(install);install.Click+=(s,e)=>{try{Install(auto.IsChecked==true);status.Text="Geïnstalleerd. Start de player via het Windows-startmenu.";install.IsEnabled=false;}catch{status.Text="Installatie mislukt. Sluit een eventueel geopende TEST-player en probeer opnieuw.";}};win.Content=panel;return app.Run(win);
  }
 }
}
