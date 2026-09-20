[CmdletBinding()]
param(
  [ValidateSet('Release','Debug')][string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $framework 'csc.exe'
if (!(Test-Path -LiteralPath $csc)) {
  $framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319'
  $csc = Join-Path $framework 'csc.exe'
}
if (!(Test-Path -LiteralPath $csc)) { throw 'De Windows .NET Framework-compiler ontbreekt.' }
$referenceRoot = Join-Path ${env:ProgramFiles(x86)} 'Reference Assemblies\Microsoft\Framework\.NETFramework\v4.8'
$explicitFrameworkReferences = @('WindowsBase','PresentationCore','PresentationFramework','System.Xaml')

function Compile([string]$name,[string]$target,[string[]]$sources,[string[]]$references,[string[]]$extra) {
  $output = Join-Path $root "bin\$Configuration\$name"
  $arguments = @('/nologo','/optimize+','/langversion:5',"/target:$target","/out:$output")
  $arguments += $references | ForEach-Object {
    $candidate = Join-Path $referenceRoot "$_.dll"
    if ($explicitFrameworkReferences -contains $_ -and (Test-Path -LiteralPath $candidate)) { "/reference:$candidate" } else { "/reference:$_.dll" }
  }
  $arguments += $extra
  $arguments += $sources | ForEach-Object { Join-Path $root $_ }
  & $csc $arguments
  if ($LASTEXITCODE -ne 0) { throw "Compilatie mislukt: $name" }
}

New-Item -ItemType Directory -Force -Path (Join-Path $root "bin\$Configuration") | Out-Null
$coreReferences = @('System.Management','System.Net.Http','System.Security','System.Web.Extensions')
$icon = Join-Path $root 'assets\NarrowVision-Player.ico'
if (!(Test-Path -LiteralPath $icon)) { throw 'NarrowVision Player-icoon ontbreekt.' }
$test = Join-Path $root "bin\$Configuration\NarrowVision-Player-TEST-Tests.exe"
Compile 'NarrowVision-Player-TEST-Tests.exe' 'exe' @('src\Core.cs','tests\Tests.cs') $coreReferences @()
& $test (Join-Path $env:TEMP 'NarrowVision-Player-TEST-Tests')
if ($LASTEXITCODE -ne 0) { throw 'Gedragstests mislukt.' }

$player = Join-Path $root "bin\$Configuration\NarrowVision-Player.exe"
Compile 'NarrowVision-Player.exe' 'winexe' @('src\Core.cs','src\Player.cs') ($coreReferences + @('WindowsBase','PresentationCore','PresentationFramework','System.Xaml')) @("/win32manifest:$(Join-Path $root 'src\app.manifest')","/win32icon:$icon")
$setup = Join-Path $root "bin\$Configuration\NarrowVision-Player-Setup.exe"
Compile 'NarrowVision-Player-Setup.exe' 'winexe' @('installer\Installer.cs') @('WindowsBase','PresentationCore','PresentationFramework','System.Xaml') @("/resource:$player,player.exe","/win32icon:$icon")

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item -LiteralPath $player -Destination (Join-Path $dist 'NarrowVision-Player-0.2.0-TEST.exe') -Force
Copy-Item -LiteralPath $setup -Destination (Join-Path $dist 'NarrowVision-Player-0.2.0-TEST-Setup.exe') -Force
Write-Host "Klaar: $(Join-Path $dist 'NarrowVision-Player-0.2.0-TEST.exe')"
Write-Host "Klaar: $(Join-Path $dist 'NarrowVision-Player-0.2.0-TEST-Setup.exe')"
