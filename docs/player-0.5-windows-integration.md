# NarrowVision Player 0.5 + Windows beheerintegratie

Deze branch gebruikt uitsluitend het TEST-project `bqapbwsvfofgnfogwhdx`. Productieconfiguratie en productieproject worden niet gebruikt of gewijzigd.

## Android Player 0.5.0

- Package-id blijft `nl.screenflow.player`.
- `device_uid` is een random UUID die lokaal blijft bestaan over herstarts. Na het wissen van appdata ontstaat bewust een nieuwe identity.
- `player_id` en `device_uid` staan lokaal; `player_secret` wordt AES-GCM versleuteld met een niet-exporteerbare Android Keystore-sleutel.
- Bootstrap, heartbeat en config gebruiken uitsluitend de Supabase Player API. Geen hosted registratie-, pairing-, heartbeat- of configroute blijft in de app aanwezig.
- Metadata komt uit `Build.MANUFACTURER`, `Build.MODEL`, `Build.VERSION.RELEASE`, SDK en build-display. Er is geen hardcoded testtablet.
- Heartbeat draait elke 30 seconden; tijdelijke fouten gebruiken een back-off van 10 seconden tot maximaal 5 minuten.
- Pending players tonen de pairingcode en onthouden die lokaal tot koppeling, zodat een app-herstart de geldige code niet verliest. Een code-refresh is niet geïmplementeerd, omdat API v1 hiervoor nog geen geauthenticeerd refresh-contract biedt.
- Active players halen manifest/config op. Offline mediacache, renderer/scheduler en command-executie zijn bewust buiten deze fase gehouden.

## Windows beheer

- De testbuild gebruikt de TEST Supabase-URL en alleen de publishable key.
- De manager-Players-pagina leest `devices` onder bestaande RLS en toont hardware, versies, revisions en heartbeatgegevens.
- Online is `last_seen_at` jonger dan 90 seconden.
- Koppelen roept uitsluitend `manager_pair_player(code, organization_id, name)` aan. De client wijzigt nooit rechtstreeks `devices` en toont geen player-secret of hash.

## Handmatige fysieke test

Installeer de debug-APK op een ProDVX ABPC-4220 (Android 13), open de app, voer de getoonde code in via het Windows-manageraccount op TEST en controleer dat het detailscherm `ProDVX`, `ABPC-4220`, Android 13 en appversie 0.5.0 toont. De huidige container bevat geen Android SDK/Gradle of Rust/Cargo, dus bouwen gebeurt via de bestaande GitHub Actions-workflows of op een ontwikkelmachine.
