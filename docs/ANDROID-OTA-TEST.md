# NarrowVision Android OTA — TEST implementation checkpoint

Baseline: `feature/test-android-boot-autostart` at `020dd44794350e38ec9a3d7e012ef6e9065fb926`, application ID `nl.screenflow.player`, versionCode 16, versionName `0.5.8-test`. Preserve currently installed APK, credentials, media cache and offline scheduling. This feature branch is source code only and **not** another backend environment.

## Implemented in this checkpoint

- `OtaUpdatePolicy`: rejects non-incrementing version codes, other application IDs, unsigned/untrusted URLs and missing SHA-256; exposes streaming SHA-256 validation.
- Unit tests exercise accepted and rejected metadata, URL traversal/host tricks and digest verification.
- Isolated CI executes JVM tests and Android debug compilation, without releasing an APK or touching devices.

## Required before any update button is enabled

1. Add a **private** `nv-player-releases` object bucket and immutable release metadata (`release_id`, package name, versionCode, SHA-256, signer certificate fingerprint, file size, storage path, status). Server computes the signed download URL; never trust a URL supplied by a browser or a player. Only manager access may publish/approve a release. Do not upload a release until its APK signing identity is confirmed to match installed 0.5.8.
2. Create a manager-only endpoint to enqueue a single `player_commands.type='update'` command for an active, paired Android device, referencing an approved release ID only. Block duplicates/in-progress commands and require confirmation. Existing TEST database already has the `update` enum, but there is not yet an update implementation in the player.
3. Update Android `PlayerApiClient` to process authenticated `update` commands idempotently. Download only a short-lived URL issued by the server, disable redirects, limit size, verify byte SHA-256, package ID, higher version code **and signing certificate** before installation, then report downloaded/install-pending/failed state with command ID. Preserve media playback and existing pairing credentials on failure.
4. Install using Android `PackageInstaller.Session` and handle `STATUS_PENDING_USER_ACTION` explicitly. Do not promise unattended installation on unmanaged Android: the OS may require an on-device confirmation. For guaranteed zero-touch, validate device-owner / managed kiosk provisioning with the actual ProDVX firmware. The app must never bypass system security prompts.
5. Build candidate versionCode **greater than 16**, using the **same permanent signing key** as the installed player. Confirm SHA-256 and signing certificate in GitHub Actions, then physically install the OTA-capable candidate **once** on the TEST device. An existing 0.5.8 without an updater cannot acquire this code remotely by itself unless a separate verified installer/MDM mechanism already exists.
6. On a single physical TEST player: queue update from portal, download, verify, install/approve if prompted, auto-relaunch or recover, confirm new version by heartbeat, keep pairing + cache + offline planning, test offline/reconnect, bad signature, hash mismatch, duplicate command, low disk and update rejection. Rollout to more devices only after this passes.

## Release / rollback policy

- Canary one device, then selected devices; no automatic fleet-wide rollout.
- Never auto-merge this branch to `main` or deploy to production. No database migrations or mail operations in this checkpoint.
- Rollback an APK through a **new higher versionCode** signed by the same key, not a downgrade; retain the previous known-good source/artifact.
- OTA is **NOT YET FUNCTIONAL** after this checkpoint: download, PackageInstaller, backend and portal wiring remain to be implemented and physically verified.

Android references: https://developer.android.com/google/play/app-updates and https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams
