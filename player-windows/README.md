# NarrowVision Windows Player — TEST

Windows-player voor het TEST-platform. De app registreert een Windows-device, toont een tijdelijke koppelcode en speelt uitsluitend de door de server vrijgegeven inhoud af. Identiteit en contentcache staan per Windows-gebruiker onder `%LocalAppData%\NarrowVision\Player-TEST`.

## Bouwen op Windows

Pak het zipbestand uit en dubbelklik op `BOUW-WINDOWS-PLAYER.bat`.

Of voer op Windows 10 of 11 in PowerShell uit:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\build.ps1
```

Dit gebruikt Windows' eigen .NET Framework-compiler, bouwt de player, draait de lokale gedragstests zonder backend-aanroepen en maakt:

- `dist\NarrowVision-Player-0.2.1-TEST.exe`
- `dist\NarrowVision-Player-0.2.1-TEST-Setup.exe`

Versie 0.2.1 gebruikt dezelfde productnaam en hetzelfde paarse N-icoon als Android. Afbeeldingen en video's vullen het volledige scherm met behoud van beeldverhouding; alleen overlopende buitenranden worden bij afwijkende verhoudingen afgesneden. De functionele parity omvat pairing, heartbeat/config, versleutelde apparaatidentiteit, offline cache en planning, direct netwerkherstel, veilige ontkoppeling, intrekking en automatisch starten na Windows-aanmelding.

De installer heeft geen beheerdersrechten nodig, start standaard automatisch na aanmelden en behoudt playeridentiteit plus cache bij verwijderen.
