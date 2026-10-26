# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: Der Markt bleibt offen, während dein Team gesperrt ist, dein Moonshot steht im Wochenend-Rückblick, der Moonshot-Zähler zählt bei der Sperre, und der Ass-Tipp von Pit Wall steht ganz oben im Fahrerblatt. Serverseitig kommen Ergebnisse jetzt pünktlich, weil der Timing-Feed mit dem bezahlten Schlüssel gelesen wird (dafür braucht es keinen Build).

## Neu

- **Markt während der Sperre.** MARKET in der Teamzeile öffnet die Auswahl das ganze Rennwochenende als reinen Lese-Markt: Preise, Punkte und Prognosen, nichts zum Antippen. Die Speicherleiste zeigt LOCKED · AUTO-FILL ON.
- **Moonshot im Wochenend-Rückblick.** Eine Karte zwischen den Punkten des Wochenendes und den Punktesammlern zeigt deinen Call, die Platzierung des Fahrers und die Punkte; eine Zeile rechnet Team und Moonshot zum Wochenend-Total zusammen. Ein Cash-Einsatz wird als Cash benannt; bei Annullierung heißt es, der Token kam zurück.
- **Laufende Wertung am Renntag, ausgeschaltet.** Der Code für ein LIVE +N auf jeder Kachel und einen Wert LIVE · SO FAR während des Rennens ist in diesem Build, aber nichts erscheint, bis der Live-Timing-Schalter nach der schriftlichen Zusage des Timing-Anbieters eingeschaltet wird.

## Geändert

- **Moonshot-Zähler.** Ein Token gilt als verbraucht, sobald sein Call gesperrt wird, nicht schon beim Setzen, denn ein offener Call lässt sich noch mit voller Rückerstattung abbrechen: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, danach ONE USED THIS WEEKEND.
- **Ass-Tipp zuerst.** Der ACE CALL von Pit Wall ist der erste Block im Fahrerblatt, direkt unter Name und Team des Fahrers; lautet der Tipp auf diesen Fahrer, steht MAKE ACE · 2× POINTS genau dort und die untere Schaltfläche entfällt.
