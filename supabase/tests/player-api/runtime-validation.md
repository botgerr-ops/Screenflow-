# Player API runtime validation

Validated against test project `bqapbwsvfofgnfogwhdx`; production remained unchanged.

- `player-bootstrap` active at version 2; `player-heartbeat` and `player-config` active at version 1.
- Bootstrap, single-return secret, duplicate handling and 10-per-15-minute rate limit passed; requests 11 and 12 returned 429.
- Valid heartbeat passed; wrong and cross-player secrets returned 401.
- Pending, blocked and expired-license config requests returned 403.
- Tenant manifest contained only organization A data.
- Private Storage media received fifteen-minute signed URLs.
- Only the authenticated player's commands were delivered.
- Security Advisor reported no errors or new critical warnings. The server-only rate-limit table intentionally has RLS without client policies/grants.

Result: `PLAYER API VERIFIED: JA`.
