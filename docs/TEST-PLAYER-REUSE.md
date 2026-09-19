# NarrowVision TEST — player reuse (2026-09-19)

## Implemented in TEST backend

- `player_reuse_audit`: RLS enabled, no client policies, non-public audit of explicitly released retired identity hashes.
- `manager_release_deleted_player_for_reuse(job_id, original_device_id, physical_possession_confirmed)`: authenticated manager only, checks current session and completed deletion job, refuses ambiguous multi-player snapshots, refuses already active or previously released identity; removes only matching retired hash and writes audit in the same transaction.
- One operator-authorized, single-device TEST recovery was executed through a separately checked transaction and audited. No deleted customer row or old player secret was restored.

## Not yet implemented — do not call the full reuse feature complete

- Manager portal button/dialog and live authenticated manager-session end-to-end test.
- Generalization to multi-device deletion jobs: write an explicit device-ID -> UID-hash map in future snapshots; do not correlate unrelated arrays by index.
- Routine release for active customers and correct handling of license/account assignments.
- Android secure cleanup: `MainActivity` currently clears identity and snapshot after HTTP 401 but does **not** clear `MediaCache` files or its metadata. New customer reuse must include verified deletion of old cached media and a test that re-registering never plays old content.
- Rate-limit and revoked-ID error reporting in the Android pairing UI.
- On-device testing: 401 -> new bootstrap -> pairing -> new tenant config -> old media completely gone; offline cold start; reconnect; failed authentication; stolen/revoked hardware cannot access old tenant.

Do not merge this branch into main, deploy to production, or hand a TEST player to another customer until the missing client cleanup and authorization tests pass.
