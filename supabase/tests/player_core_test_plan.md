# Player core validation plan

Run only against disposable project `bqapbwsvfofgnfogwhdx`. Production project `eckmifmgrurxgriimgpp` is read-only.

- Verify device columns, constraints, indexes, FK and preservation of existing fields.
- Verify `player_commands` types, lifecycle constraints and RLS.
- Test manager and customer pairing, expiry, single-use and invalid codes.
- Test cross-tenant read/write/pairing/command isolation.
- Race two pairings against `player_limit = 1`; exactly one may commit.
- Confirm customers cannot directly mutate protected device telemetry or identity fields.
- Confirm anon cannot execute SECURITY DEFINER functions.
- Regression-test organizations, licenses, media, playlists, schedules and support tickets.
- Run Security Advisor and record remaining intentional warnings.
