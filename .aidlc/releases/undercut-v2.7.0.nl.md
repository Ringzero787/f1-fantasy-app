# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: de markt blijft open terwijl je line-up vergrendeld is, je Moonshot staat in het weekendoverzicht, de Moonshot-teller telt bij de vergrendeling, en het ace-advies van Pit Wall staat bovenaan het coureurblad. Aan de serverkant komen uitslagen nu op tijd omdat de tijdwaarnemingsfeed met de betaalde sleutel wordt gelezen (daar is geen nieuwe build voor nodig).

## Toegevoegd

- **Markt tijdens de vergrendeling.** MARKET op de teamrij opent de kiezer het hele raceweekend als een markt om alleen te lezen: prijzen, punten en verwachtingen, niets om aan te tikken. De opslagbalk zegt LOCKED · AUTO-FILL ON.
- **Moonshot in het weekendoverzicht.** Een kaart tussen de weekendpunten en de scorers toont je call, de finish van de coureur en de punten, en één regel telt team en Moonshot op tot het weekendtotaal. Een cashinzet wordt als cash benoemd; bij een nietige call staat er dat de token terugkwam.
- **Live score op racedag, uitgeschakeld.** De code voor een LIVE +N op elke tegel en een LIVE · SO FAR-statistiek tijdens de race zit in deze build, maar er verschijnt niets tot de live-timing-schakelaar aangaat na de schriftelijke bevestiging van de tijdwaarnemingsleverancier.

## Gewijzigd

- **Moonshot-teller.** Een token telt als gebruikt zodra de call vergrendelt, niet als je hem plaatst, want een open call kan nog met volledige terugbetaling worden geannuleerd: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, daarna ONE USED THIS WEEKEND.
- **Ace-advies eerst.** De ACE CALL van Pit Wall is het eerste blok in het coureurblad, onder naam en team van de coureur; als het advies is om deze coureur ace te maken, staat MAKE ACE · 2× POINTS daar meteen en verdwijnt de knop onderaan.
