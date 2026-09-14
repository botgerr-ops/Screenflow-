# Player core runtime validation

Validated on disposable project `bqapbwsvfofgnfogwhdx` (PostgreSQL `17.6.1.166`). Production `eckmifmgrurxgriimgpp` remained unchanged.

- Migration applied without SQL errors.
- All required device fields, unique indexes, pairing index and playlist FK passed.
- `player_commands` PK/FK, enums, timestamps, payload constraints and RLS passed.
- Manager and customer pairing passed; customer organization came only from authenticated context.
- Expired, invalid and reused codes were rejected.
- Cross-tenant device and command access was rejected.
- Two concurrent pairings with `player_limit = 1` produced exactly one success; license-row locking held.
- Direct customer mutation of protected device fields changed zero rows.
- Anon execution of SECURITY DEFINER functions was blocked; required authenticated RPCs and triggers remained functional.
- Regression checks passed for organizations, licenses, media, playlists, items, planning and tickets.
- Security Advisor: zero errors and zero anonymous SECURITY DEFINER warnings. Fifteen intentional authenticated SECURITY DEFINER notices and leaked-password protection remained open.

Result: `PLAYER CORE DATABASE VERIFIED: JA`.
