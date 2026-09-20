# NarrowVision Android OTA 0.5.9 TEST — installatiestatus

**Scope:** uitsluitend Supabase TEST `bqapbwsvfofgnfogwhdx`. Geen bestaande Android-installaties verwijderen, geen app-data wissen, geen automatische massa-uitrol. De huidige 0.5.8 blijft als herstelreferentie bestaan.

## Gebouwde bootstrap

- Package ID: `nl.screenflow.player` (ongewijzigd).
- `versionCode`: **17**, `versionName`: `0.5.9-test-ota`.
- Permanent bestaande TEST-signingkey gebruikt. GitHub Actions build, unit tests, APK ZIP-check en `apksigner verify --print-certs` geslaagd: run `35510909590`.
- SHA-256 installatie-APK uit die run: `acfbeecd54db3484d25b5c04c8be05db2890ecb6e18cc345bc3289b087113ed6`.
- Signed artifact: `NarrowVision-Player-0.5.9-TEST-OTA-Bootstrap` in run `35510909590` (artifactretentie 30 dagen). Gebruik **niet** het oudere artifact uit run `35510486583`, dat mist de laatste duplicaatbeveiliging.

## Voorafgaand aan fysieke installatie

1. Noteer huidige device-ID, gekoppelde klant, appversie en actieve media/planning. Controleer dat het bestaande scherm nog afspeelt.
2. Installeer APK als update **over** de bestaande app; niet uninstalleren, niet app-data wissen. Android moet het APK-signingcertificaat accepteren. Bij een signingmismatch stoppen en de bestaande app behouden; niet omzeilen door uninstall.
3. Controleer daarna in Android Instellingen dat de app versie `0.5.9-test-ota` draait, en dat pairing, media, playlist, planning, heartbeat, offline, reconnect en reboot nog werken.
4. Geef in Android-instellingen zo nodig expliciet toestemming voor app-installaties door NarrowVision. Op onbeheerde Android-apparaten kan elke OTA-installatie een bevestiging op het fysieke apparaat vereisen. Test onbeheerd updaten op deze ProDVX vóór verdere uitrol.

## OTA-keten na bootstrap

- Managerportal: Schermen → Android-updates (TEST). Upload **een nieuwere** APK (`versionCode` minimaal 18), gebouwd met dezelfde permanente signingkey. Server controleert bestandsgrootte en SHA-256 vóór goedkeuring.
- Manager selecteert expliciet **één** gekoppeld Android-scherm en bevestigt de opdracht. Backend bewaart commandstatus. Geen auto-update, geen groepsuitrol.
- Player haalt een uur geldige signed URL op, accepteert uitsluitend de vertrouwde TEST-storagehost/bucket, hogere versie, identieke package-ID, geldige SHA-256 en gelijk signingcertificaat.
- Android PackageInstaller voert de installatie uit en kan om lokale toestemming vragen. Status `queued` → `delivered` → `acknowledged` → `completed` of `failed` wordt in `player_commands` weergegeven. Het bewijs van een succesvolle update blijft de **nieuwe versie in Android én op de heartbeat**, niet alleen een HTTP 200.
- Herstart of netwerkverlies mag geen nieuwe identiteit of gewiste cache veroorzaken. Bij updatefout niet automatisch uninstalleren, terugrollen via andere signingkey of gebruikersdata wissen.

## Nog verplicht vóór de eerste OTA-opdracht

- Live portal-control op `app.narrowvision.eu` aantoonbaar aanwezig, managerrollen echt ingelogd getest.
- Signed release `versionCode >= 18` gebouwd, gedownload, geverifieerd en via manager geüpload. De 0.5.9-bootstrap zelf is niet de test-update naar zichzelf.
- Op één fysieke ProDVX controleren: handmatige update 0.5.8 → 0.5.9, daarna OTA 0.5.9 → hogere versie, lokale installatietoestemming, checksumfout, offline herstel en correcte statusrapportage.
- Bij een afgebroken of mislukte poging: eerst vaststellen of de Android-installer nog om toestemming vraagt. Geen tweede opdracht maken zolang oude opdracht `queued`, `delivered` of `acknowledged` is; los de status gecontroleerd op.

**Geen commerciële vrijgave of stille-installatieclaim zonder bovenstaande fysieke verificatie.**
