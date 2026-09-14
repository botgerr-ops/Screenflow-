# ScreenFlow Admin 0.8.4 TEST

- Herstelt het bewerken van bestaande planningen door de planning-ID expliciet en onveranderlijk door te geven.
- Blokkeert ongeldige of verouderde planning-ID's lokaal voordat een TEST-request wordt verstuurd.
- Voegt een DOM-klikregressietest toe die controleert dat bewerken een PATCH met de bestaande UUID uitvoert.
- Voorkomt dat de klik op “Planning toevoegen” als bestaand planningobject wordt geïnterpreteerd.

Alleen bedoeld voor de TEST-omgeving.
