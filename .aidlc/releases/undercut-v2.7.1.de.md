# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: behebt den Absturz beim Start in 2.7.0, lässt den Wochenend-Rückblick dein Wochenende so erzählen, wie es gewertet wurde, ein Rückblick pro Team, und hält Moonshot nach einer frischen Anmeldung eingeschaltet.

## Behoben

- **Absturz beim Start in 2.7.0.** 2.7.0 wurde ohne seine Firebase-Web-Konfiguration gebaut und blieb auf jeder Plattform am Startbildschirm stehen. 2.7.1 sind dieselben Funktionen korrekt gebaut, und die Build-Skripte lehnen ein Bundle ohne diese Konfiguration jetzt ab.
- **Moonshot nach der Anmeldung aus.** Die App las ihre Konfiguration einmal beim Start, manchmal bevor die Sitzung wiederhergestellt war, und behielt die Standardwerte für die ganze Sitzung: Moonshot-Zähler, die Moonshot-Karte im Rückblick und die Zeile zur nächsten Runde blieben bis zum nächsten Kaltstart verborgen. Die Konfiguration wird jetzt erneut gelesen, sobald die Anmeldung bekannt ist.

## Geändert

- **Wochenend-Rückblick aus der Wertung.** Der Rückblick zeigt jetzt deine Punkte, wie der Server sie gewertet hat, Pick für Pick, mit ACE ×2, TEAM und AUTO markiert und Picks mit 0 Punkten in einer Zeile; FIELDED n OF 6, wenn Plätze frei waren; deinen Platz in der Runde mit dem Abstand zum Sieger und deinen Saisonrang mit seiner Bewegung; deinen abgerechneten Moonshot mit dem Wochenend-Total; und die nächste Runde mit ihrer Sperre und deinem Moonshot darauf. Die Karte nennt das Team, und wer zwei Teams hat, bekommt pro Team einen Rückblick.
