# NarrowVision Player API v1

The player API consists of `player-bootstrap`, `player-heartbeat` and `player-config`. All three are deployed with `verify_jwt=false` because a player is not a Supabase Auth user. Heartbeat and config authenticate every request with `X-Player-Id` and `X-Player-Secret`; bootstrap accepts those headers only to recognize an already registered device.

## Security contract

- Bootstrap returns a 256-bit plaintext secret exactly once and stores only its SHA-256 hash.
- Pairing codes use twelve symbols from a 32-character alphabet and expire after ten minutes.
- Duplicate registration never returns credentials without the existing valid secret.
- Bootstrap is limited to ten requests per request fingerprint per fifteen minutes.
- Player credentials authorize only that exact device; organization scope is loaded server-side.
- The service-role key exists only in the Edge Function environment and must never enter player code.
- Media is private and delivered with fifteen-minute signed URLs.
- Commands are selected and marked delivered only for the authenticated device.

## Requests

All routes accept `POST` with `Content-Type: application/json` and return `api_version: narrowvision-player-v1`.

### player-bootstrap

Required JSON: `device_uid`, `platform`. Optional: `manufacturer`, `model`, `os_version`, `sdk_version`, `firmware_version`, `app_version`.

### player-heartbeat

Requires player headers. Accepts optional telemetry, applied `config_revision`, `sync_succeeded` and an organization-owned `current_playlist_id`. Returns revision state and queued commands.

### player-config

Requires player headers and an active, paired, licensed player. Returns organization-scoped schedules, playlists, playlist items, signed media and queued commands.
