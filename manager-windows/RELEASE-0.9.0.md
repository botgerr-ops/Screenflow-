# NarrowVision Admin 0.9.0

Deze release verandert de zichtbare productnaam van ScreenFlow naar NarrowVision en gebruikt het nieuwe blauw-paarse N-beeldmerk in de app en Windows-installer.

De bestaande installatie-ID `nl.screenflow.manager`, sessies, Supabase-functies en opslagpaden blijven bewust ongewijzigd. Daardoor installeert 0.9.0 over de bestaande app heen en blijven accounts, tickets, media en planningen behouden.

De operationele aanvullingen uit 0.8.1 zijn eveneens opgenomen: licentiewaarschuwingen, opslaggebruik en een afhankelijkheidscontrole voordat gebruikte media wordt verwijderd. Voer daarvoor eenmalig `supabase/operational-summary.sql` uit.
