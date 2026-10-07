# uc-v2.5.0 — 2026-10-07

Moonshot-raceverwachtingen, teamnaam bewerken en verbeteringen aan live-timing in Undercut 2.5.0.

## Toegevoegd

- **Moonshot**: vanaf ronde 13 kan een team dat achterstaat in zijn league één call doen op een coureur voor de volgende race – winst, podium, punten of een rivaal verslaan – met een deel van zijn seizoenspunten of rosterbudget als inzet. Een hit telt de beloning bij je seizoenstotaal op; een misser kost de inzet. Beschikbaar in de team- en league-weergaven, met uitleg bij eerste gebruik.
- Verwerking van live-timingdata op race dag, verspreid over Firestore voor realtime updates.
- Mogelijkheid om je teamnaam en de weergavenaam van je manager aan te passen vanuit de Pit Wall portal; wijzigingen worden gesynchroniseerd op al je apparaten.
- Het lettertype Archivo in de app, passend bij de Pit Wall webportal.

## Gewijzigd

- Synchronisatie van teamgegevens is nu slimmer: alleen lokale wijzigingen van jouw apparaat worden geüpload naar Firestore, zodat wijzigingen elders niet worden teruggedraaid.
- De lineup lock die in de app wordt getoond, komt nu overeen met de door de server afgedwongen sluitingstijd.

## Opgelost

- Beveiligingscontrole aangescherpt voorafgaand aan de release van 2.5.0.
- Het aanmaken van een league geeft niet langer toegang tot betaalde functies zonder geldige licentie.
- Team-league-ID's worden nu gevalideerd als bruikbare Firestore-document-ID's.
- Synchronisatie van metadata overschrijft niet langer nieuwere serverversies tijdens periodieke updates.
