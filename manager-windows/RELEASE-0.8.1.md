# ScreenFlow Admin 0.8.1

## Installeren

Voer eerst `supabase/operational-summary.sql` volledig uit in Supabase SQL Editor. Installeer vervolgens ScreenFlow-Admin-Windows over de bestaande versie. De SQL mag opnieuw worden uitgevoerd. De bestaande ticket- en contentmigraties moeten al aanwezig zijn. Geen Edge Function- of mailsjabloonwijziging nodig.

## Toegevoegd

- Manager: waarschuwingen in de klantenlijst en klantdetailpagina; Overzicht behoudt zijn bestaande indeling.
- Klant: waarschuwingen op Overzicht bij 30, 14 en 7 dagen resterend, op de einddatum en tijdens de zeven kalenderdagen respijt daarna.
- Einddatum is geldig tot het einde van die datum in Europe/Amsterdam. Handmatig geblokkeerde licenties krijgen geen respijt.
- De datumcontrole gebruikt Supabase-servertijd met een monotone klok; een andere Windows-datum verlengt de licentie niet. Als controle mislukt, meldt de app dat de status onbekend is.
- Media toont het totale aantal geregistreerde bestanden en hun gezamenlijke omvang, ook als er meer dan 1000 bestanden zijn. Er is nog geen opslaglimiet vastgesteld en er wordt dus geen fictieve maximumcapaciteit getoond. Dit is geen overzicht van netwerkverkeer, backups of ongekoppelde storage-objecten.
- Voor media verwijderen toont de app de actuele namen van de afspeellijsten waarin het bestand voorkomt, met het aantal verwijzingen. Bij een mislukte controle gaat verwijderen niet door. Annuleren behoudt het bestand.

De meldingen staan in de app; er worden nog geen automatische e-mails verzonden. Offline playergedrag, de technische handhaving van respijt op de player, logboek, fallback-playlists en updateherstel staan nog op de bouwlijst. Deze release verandert geen bestaande licentiedatums, playlists of mediabestanden.

## Validatie

`cd manager-windows/tests && npm install && npm test`

Tests dekken datumgrenzen, zeven dagen respijt, Amsterdam-datumovergang, geblokkeerde licenties, onbekende servertijd, annuleren/mislukken van verwijdercontroles, SQL opnieuw uitvoeren, totalen boven 1000 bestanden en weigeren van gegevens van andere klanten. De ticket- en herstelinterface-regressietests blijven meedraaien. Live Windows- en Supabase-tests blijven nodig na installatie.
