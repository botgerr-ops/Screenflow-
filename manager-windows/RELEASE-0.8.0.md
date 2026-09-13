# ScreenFlow Admin 0.8.0

De Manager ziet algemene statistieken uitsluitend op Overzicht. Klanten toont de klantenlijst; klantdetails tonen online/offline, laatste contact, appversie, firmware en bekende app-updateversie. Zonder echte heartbeat of versiegegevens wordt geen online- of up-to-date-status aangenomen.

Verzoeken heeft Openstaand en Archief, doorzoekbaar op ticketnummer, klant, onderwerp en gesprek. Iedere melding krijgt een vast SFT-volgnummer. Afgerond vraagt een oplossing en betekent Wacht op bevestiging. De eigen klant kan bevestigen of terugreageren. Alleen bevestiging archiveert het ticket. Het gesprek blijft bewaard en gearchiveerde tickets zijn alleen leesbaar. Bestaande afgeronde tickets wachten op bevestiging.

## Installeren

1. Voer `supabase/ticket-archive.sql` volledig uit in Supabase SQL Editor, na de eerdere supportmigraties. Deze update mag opnieuw worden uitgevoerd.
2. Open Supabase Authentication → Email Templates → Reset password. Stel het onderwerp in op `ScreenFlow — herstel je wachtwoord`. Vervang de inhoud door `supabase/reset-password-email.html` en sla op. Het sjabloon gebruikt `{{ .Token }}`; laat die tekst letterlijk staan. Er is geen browserredirect nodig.
3. Controleer dat Supabase e-mail kan versturen naar het testadres. Met de standaard maildienst kunnen ontvangers beperkt zijn; voor echte klanten is een werkende eigen SMTP-configuratie nodig. Bron: https://supabase.com/docs/guides/auth/auth-smtp
4. Sluit ScreenFlow Admin en installeer de 0.8.0-installer over de bestaande versie. Installatie-ID blijft `nl.screenflow.manager`.

Er is voor deze versie geen gewijzigde Edge Function. De bestaande `manager-customer-admin` wordt alleen gebruikt wanneer een klant met een verplicht tijdelijk wachtwoord dat via herstel daadwerkelijk heeft vervangen.

## Wachtwoord vergeten

Klant kiest Wachtwoord vergeten, vraagt een code aan, voert de ontvangen code in en kiest tweemaal een nieuw wachtwoord van minimaal 12 tekens. De code wordt als Supabase recovery-token gecontroleerd. De herstelsessie blijft alleen in geheugen, opent geen dashboard en wordt niet in localStorage opgeslagen. Na wijzigen meldt de klant opnieuw aan. Geen nieuwe accounts worden aangemaakt. Het definitieve wachtwoord wordt niet aan de manager getoond.

Documentatie: https://supabase.com/docs/guides/auth/auth-email-templates

## Controleren

- Manager: Overzicht houdt drie statistiekblokken; Klanten en Verzoeken hebben die niet.
- Klant openen: alleen eigen players, aantallen online/offline, versies en onbekende updategegevens duidelijk gelabeld.
- Manager beantwoordt ticket met oplossing en kiest Afgerond. Ticket blijft open als Wacht op bevestiging.
- Klant kan terugreageren (ticket wordt opnieuw Nieuw) of Ja, opgelost kiezen (ticket verhuist naar Archief).
- Zoek in Archief op het ticketnummer en een woord uit de oplossing.
- Test herstel met een echt ontvangen code. Een foutieve/verlopen code mag geen wachtwoord wijzigen.

SQL-regressietest: `cd manager-windows/tests && npm install && npm test`.
De live e-mailbezorging, Supabase-configuratie en installatie op Windows moeten na bovenstaande configuratie nog met een testaccount worden gecontroleerd. De fysieke player- en firmware-integratie is nog niet aangesloten.
