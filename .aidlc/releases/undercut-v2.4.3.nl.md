# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: één account overal, veiligere aankopen en premiumfuncties voor Pit Wall.

## Nieuw

- Inloggen over alle stores heen: je account werkt of je nu via Google Play, de App Store of Amazon Appstore hebt geïnstalleerd
- Deel standen in je league en je team direct vanuit de app
- Pit Wall Pass-rechten worden nu ingetrokken als de store je aankoop terugbetaalt
- Nieuw overzicht in de app dat laat zien wat je pass precies heeft gekocht
- Pit Wall Briefing vernieuwd met heldersectie, oproepenbalk en prijsbewegers

## Gewijzigd

- De Ace-lock gebruikt nu de serverkalender in plaats van de ingebouwde kalender
- Pit Wall-projecties tonen nu ook minimum, mediaan, maximum, DNF-risico en verwachte volgende prijs
- De Pit Wall Pass ($14,99/seizoen) is nu het enige premiumproduct; League Pro volgt automatisch uit het bezit van de pass

## Opgelost

- **Beveiliging**: vervalste Play Store-tokens konden geen pakketten of passes meer kopen tegen onjuiste prijzen
- **Beveiliging**: terugval op productie-API-sleutel verwijderd; geen stille downgrade meer bij configuratiefouten
- Het Ace-venster bevriest nu voor elke sessie die meetelt, niet alleen races
- Overdracht van inloggen is nu gekoppeld aan het apparaat waarop het is gestart
- Aankopen worden nu één keer per transactie toegekend, niet één keer per app-start
- Pass-toekenningen werken nu correct na intrekkingen
- Vastgelopen aankopen in de wachtrij van de store worden nu correct afgerond
- Rondefout hersteld; Bahrein staat weer op Sepang als R18
- Negen operationele scripts falen niet meer stilzwijgend bij importeren
- Het SHARE-veld van het team wordt nu als bedieningselement gelezen, niet als bijschrift
- Import van seeder gestopt; kalender klopt nu weer
- iOS-build biedt de optie Amazon Appstore niet meer aan

## Beveiliging

- Ace-lock verplaatst naar de server; alleen-app-implementatie verwijderd
- Gedeelde geheimen van Amazon en Apple verhuisd naar Secret Manager
- Amazon-bonnummers gebruiken nu hun eigen formaat, niet dat van de Play Store
- Ernstige kwetsbaarheden in dependencies verholpen
- Alle beveiligingen en uitzonderingsklassen bij het importeren zijn nu afgesloten
