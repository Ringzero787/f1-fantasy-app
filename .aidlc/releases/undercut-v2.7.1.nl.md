# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: verhelpt de crash bij het opstarten in 2.7.0, laat het weekendoverzicht je weekend vertellen zoals het geteld is, één overzicht per team, en houdt Moonshot aan na een nieuwe aanmelding.

## Opgelost

- **Crash bij het opstarten in 2.7.0.** 2.7.0 was gebouwd zonder zijn Firebase-webconfiguratie en bleef op elk platform op het startscherm staan. 2.7.1 bevat dezelfde functies, correct gebouwd, en de buildscripts weigeren nu een bundel zonder die configuratie.
- **Moonshot uit na aanmelden.** De app las zijn configuratie één keer bij de start, soms voordat de sessie hersteld was, en hield de standaardwaarden de hele sessie: de Moonshot-teller, de Moonshot-kaart in het overzicht en de regel voor de volgende ronde bleven verborgen tot een koude start. De configuratie wordt nu opnieuw gelezen zodra de aanmelding bekend is.

## Gewijzigd

- **Weekendoverzicht uit de telling.** Het overzicht toont nu je punten zoals de server ze telde, per pick, met ACE ×2, TEAM en AUTO gemarkeerd en picks met 0 punten op één regel; FIELDED n OF 6 als er plekken open waren; je plaats in de ronde met de achterstand op de winnaar en je seizoensplaats met de beweging; je afgerekende Moonshot met het weekendtotaal; en de volgende ronde met de vergrendeling en je Moonshot erop. De kaart noemt het team, en wie twee teams heeft krijgt per team een overzicht.
