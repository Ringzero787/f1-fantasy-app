# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: Dynamische seizoensherkenning, scoringscorrecties en eerlijke contractregels

## Toegevoegd

- Server-gestuurde meldingsbalk op het Team-paneel voor tijdige aankondigingen zonder app-updates
- Visuele markering voor open opstellingsplekken (zachte accentkleur, gestippelde rand, omcirkeld plusteken)
- Automatisch invullen reset nu de teller voor verouderde-selectiestraf, net als een handmatige transfer
- Beheerdersstatistieken-aggregator voor dagelijkse gebruiksinzichten
- Automatische herhaling voor vastgehouden race-uitslagen met oplossing voor onbekende autonamen
- Eind-tot-eind testen van racecorrecties op de Firestore-emulator

## Gewijzigd

- **Breaking:** De app leest het huidige seizoen nu van de server in plaats van het apparaatjaar — rebuild vereist voor gereedheid voor 2027
- Contractduur is nu beperkt tot het aantal resterende races in het seizoen en reeksen van zes races per coureur
- Correcties op race-uitslagen achteraf herberekenen nu alle betrokken teams binnen een venster van 72 uur
- Verlopen verkopen worden nu uitgevoerd tegen prijzen na de race, niet ervoor
- Seizoensovergang archiveert nu 2026, reset teams en klassementen, en stelt prijzen en kalender voor 2027 in
- Verkoop van de Pit Wall Pass verplaatst naar december voor het volgende seizoen (beschikbaarheid buiten het seizoen)
- Testaccounts van stores uitgesloten van beheerdersstatistieken

## Opgelost

- Terugbetaling van straffen voor verouderde selecties bij automatisch ingevulde teams voor Las Vegas 2026
- Compatibiliteit met iOS 15.1+ (ondersteuning voor Xcode 27, bescherming voor expo-router op iOS 16)
- Racecorrectie en herstel van verlopen items schrijven nu atomair met set+mergeFields
- Herstel van verlopen verkoop voorkomt dat het budget onder nul daalt
- Seizoensovergang reset teams met de juiste prijsvolgorde
- Beveiligingscontrole van afhankelijkheden; algemene GHSA-uitzondering verwijderd

## Beveiliging

- Alleen beheerders kunnen geaggregeerde statistieken lezen via Firestore-regels
- Kwetsbaarheden in afhankelijkheden verholpen
