# NarrowVision TEST — OTA zonder bevestigingen (20 september 2026)

## Doel en scope
Deze branch is uitsluitend een TEST-kandidaat. Android Player 0.5.9 (bootstrap) en de gesigneerde 0.5.10-release blijven onveranderd. Niet mergen naar main en geen release automatisch uitrollen. De bestaande gekoppelde player en content behouden.

## Technische wijziging
- Android 12+ `PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED` in plaats van een geforceerd `USER_ACTION_REQUIRED`.
- Manifest verklaart `android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION` naast de reeds aanwezige `REQUEST_INSTALL_PACKAGES`.
- App-pakket `nl.screenflow.player`, dezelfde permanente TEST-ondertekening en veiligheidscontroles (versie, SHA-256, grootte, pakketnaam, signer) blijven behouden.
- Kandidaat 0.5.11-test, versionCode 19; doel is een toekomstige 0.5.11 -> 0.5.12 zelfupdate zonder fysieke handeling.
- Android beslist uiteindelijk. `STATUS_PENDING_USER_ACTION` kan nog steeds optreden, bijvoorbeeld bij onvoldoende rechten of OEM-beperkingen.

## Belangrijke overgang
Een op 0.5.9 draaiende player kan niet met terugwerkende kracht deze nieuwe installercode uitvoeren. De eerste overgang 0.5.9 -> 0.5.11 kan daarom nog gebruikersbevestiging nodig hebben. Installeer de kandidaat alleen na een geslaagde build, verificatie van APK-handtekening en expliciete keuze van precies één TEST-scherm. Maak vervolgens een apart gesigneerd build 20 / 0.5.12-test als echte nul-klik-controle. De managerportal staat standaard nog op build 18 / 0.5.10; zet voor een 0.5.11-upload onder Geavanceerd **19** en **0.5.11-test** (verzending nooit automatisch).

## Verplichte fysieke acceptatietest
1. Noteer pakket-/versiecode van de ProDVX ABPC-4220, de reeds verleende 'Install unknown apps'-toestemming, en bevestig dat scherm `woonkamer` aan dezelfde TEST-organisatie is gekoppeld.
2. Controleer geslaagde GitHub Actions-run, ondertekening en SHA-256 van build 19; stuur uitsluitend de nieuwe versie naar het eigen TEST-scherm.
3. Controleer dat 0.5.11 is geïnstalleerd, en dat schermkoppeling, huidige planning, offline-cache en afspelen intact blijven. Een eventuele eenmalige bevestiging tijdens deze overgang is **geen** bewijs voor silent OTA.
4. Maak gesigneerde build 20 / 0.5.12 vanuit dezelfde geteste branch met onveranderde pakketnaam, SDK-target en sleutel. Laat tests en checksum opnieuw uitvoeren.
5. Stuur 0.5.12 uitsluitend naar `woonkamer`; raak het apparaat niet aan. Observeer fysiek of Android een bevestiging of instellingenvenster toont.
6. Controleer een status `completed`, gemelde 0.5.12-versie, ongewijzigde koppeling/playlist, online heartbeat en herstel na herstart. Bij `STATUS_PENDING_USER_ACTION` of verzoek om bevestiging: **TEST afgekeurd voor unattended OTA**; onderzoek OEM-/device-owner/MDM-route en rol niet uit naar klanten.
7. Pas na twee succesvolle unattended-installaties en hersteltests de mogelijkheid voor gefaseerde multi-screen-uitrol onderzoeken. Geen automatische bulkuitrol in deze branch.

## Android-documentatie
`PackageInstaller.SessionParams#setRequireUserAction`: https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setRequireUserAction(int). De API noemt expliciet voorwaarden voor de doel-API, installer- of self-update-identiteit, permissie en een eventuele `STATUS_PENDING_USER_ACTION`-fallback.

## Niet aangetoond door CI
CI kan de APK bouwen, unit tests uitvoeren en de handtekening verifiëren; CI bewijst niet dat het ProDVX-firmwarebeleid een installatiesessie zonder gebruikersactie accepteert. Geen productieaanpassingen en geen automatische apparaatupdates.
