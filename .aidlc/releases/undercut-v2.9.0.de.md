# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: Dynamische Saisonerkennung, Punktekorrekturen und faire Vertragsregeln

## Added

- Serverseitig gesteuertes Hinweisbanner im Team-Bereich für aktuelle Ankündigungen ohne App-Updates
- Visuelle Hervorhebung freier Aufstellungsplätze (dezenter Akzent, gestrichelter Rahmen, umrandetes Plus)
- Die automatische Besetzung setzt den Zähler für die Strafe wegen veralteter Kader jetzt wie ein manueller Transfer zurück
- Admin-Statistik-Aggregator für tägliche Nutzungseinblicke
- Automatischer Wiederholungsversuch für zurückgehaltene Rennergebnisse mit Auflösung unbekannter Fahrzeugnamen
- End-to-End-Tests für Rennkorrekturen im Firestore-Emulator

## Changed

- **Breaking:** Die App liest die aktuelle Saison jetzt vom Server statt vom Gerätejahr – ein Neu-Build ist für die 2027-Bereitschaft erforderlich
- Die Vertragslaufzeit ist jetzt durch die verbleibenden Saisonrennen und Sechs-Rennen-Fahrerläufe begrenzt
- Ergebniskorrekturen nach dem Rennen bewerten alle betroffenen Teams innerhalb eines 72-Stunden-Fensters neu
- Ablaufverkäufe werden zu Preisen nach dem Rennen ausgeführt, nicht zu Preisen davor
- Der Saisonwechsel archiviert jetzt 2026, setzt Teams und Tabellen zurück und legt Preise und Kalender für 2027 fest
- Der Verkauf des Pit Wall Pass für die nächste Saison wurde auf Dezember verschoben (Verfügbarkeit in der Nebensaison)
- Store-Testkonten sind von den Admin-Statistiken ausgeschlossen

## Fixed

- Strafen für veraltete Kader bei automatisch besetzten Teams für Las Vegas 2026 wurden erstattet
- Kompatibilität mit iOS 15.1+ (Unterstützung für Xcode 27, expo-router-Schutz für iOS 16)
- Rennkorrekturen und Ablaufreparaturen schreiben jetzt atomar mit set+mergeFields
- Die Reparatur des Ablaufverkaufs verhindert, dass das Budget unter null fällt
- Der Saisonwechsel setzt Teams mit korrekter Preisreihenfolge zurück
- Sicherheitsüberprüfung der Abhängigkeiten; pauschale GHSA-Ausnahme entfernt

## Security

- Nur für Admins zugängliche Firestore-Leseregeln für aggregierte Statistiken
- Sicherheitslücken in Abhängigkeiten behoben
