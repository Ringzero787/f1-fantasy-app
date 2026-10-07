# uc-v2.5.0 — 2026-10-07

Moonshot-Rennvorhersagen, Bearbeitung des Teamnamens und Verbesserungen beim Live-Timing in Undercut 2.5.0.

## Neu

- **Moonshot**: Ab Runde 13 kann ein Team, das in seiner Liga zurückliegt, einen Call auf einen Fahrer für das nächste Rennen abgeben – Sieg, Podium, Punkte oder einen Rivalen schlagen – und dafür Saisonpunkte oder Kaderbudget einsetzen. Ein Treffer bringt die Belohnung auf die Saisonwertung; ein Fehlschlag kostet den Einsatz. In der Team- und Liga-Ansicht, mit Einführung beim ersten Start.
- Erfassung von Live-Timing-Daten am Renntag, verteilt über Firestore für Echtzeit-Updates.
- Möglichkeit, deinen Teamnamen und den Anzeigenamen deines Managers über das Pit-Wall-Portal zu ändern; Änderungen werden auf allen deinen Geräten synchronisiert.
- Die Schriftart Archivo in der App, passend zum Pit-Wall-Webportal.

## Geändert

- Die Synchronisierung der Team-Metadaten ist jetzt intelligenter: Nur lokale Änderungen deines Geräts werden zu Firestore hochgeladen, sodass Änderungen von anderen Geräten nicht mehr überschrieben werden.
- Die in der App angezeigte Sperrfrist für die Aufstellung stimmt nun mit der vom Server festgelegten Sperrzeit überein.

## Behoben

- Sicherheitsverbesserungen im Rahmen einer Überprüfung vor dem Release von 2.5.0.
- Beim Erstellen einer Liga werden kostenpflichtige Funktionen nicht mehr ohne entsprechende Lizenz freigeschaltet.
- Liga-IDs von Teams werden jetzt als gültige Firestore-Dokument-IDs überprüft.
- Die Metadaten-Synchronisierung überschreibt bei regelmäßigen Updates keine neueren Serverversionen mehr.
