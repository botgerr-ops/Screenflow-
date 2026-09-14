# ScreenFlow Admin 0.8.2 TEST

## Beveiligingsfix

Deze TEST-build vervangt de eerste wachtwoordwijziging door één server-side actie.

- De klant voert het tijdelijke wachtwoord en een nieuw wachtwoord in.
- De Edge Function verifieert het tijdelijke wachtwoord.
- De server zet het nieuwe wachtwoord en wist daarna pas `force_password_change`.
- Tijdelijke klanten krijgen via RLS geen klantdata of klant-RPC-toegang totdat die stap is geslaagd.
- Herstel via een geldige Supabase-recoverysessie volgt dezelfde server-side afronding.

Installeer uitsluitend als TEST-build. Productie is niet gewijzigd.