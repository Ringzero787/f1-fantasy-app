# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: Einheitliche Konten, Kaufsicherheit und Premium-Funktionen für Pit Wall.

## Neu

- Store-übergreifende Anmeldung: Dein Konto funktioniert unabhängig davon, ob du über Google Play, den App Store oder den Amazon Appstore installiert hast
- Ligastände und dein Team direkt aus der App teilen
- Pit Wall Pass-Berechtigungen werden jetzt widerrufen, wenn der Store deinen Kauf erstattet
- Fahrerdetails in der App zeigen, was dein Pass freigeschaltet hat
- Pit Wall Briefing neu gestaltet mit Hero-Bereich, Calls-Leiste und Preisbewegungen

## Geändert

- Die Ace-Sperre liest jetzt den Server-Kalender statt des gebündelten Kalenders
- Pit Wall-Prognosen enthalten jetzt Tiefst-, Median- und Höchstwert, DNF-Risiko sowie Preisschätzungen für die nächste Runde
- Der Pit Wall Pass (14,99 $/Saison) ist das einzige Premium-Produkt; League Pro leitet sich aus dem Passbesitz ab

## Behoben

- **Sicherheit**: Manipulierte Play Store-Tokens konnten keine Packs oder Pässe mehr zu falschen Preisen kaufen
- **Sicherheit**: Fallback auf den Produktions-API-Schlüssel entfernt; kein stilles Downgrade mehr bei Konfigurationsfehlern
- Das Ace-Fenster friert jetzt für jede Session ein, in der es zählt, nicht nur für Rennen
- Die Anmeldeübergabe ist jetzt auf das Gerät beschränkt, das sie gestartet hat
- Käufe werden jetzt einmal pro Transaktion gewährt, nicht einmal pro App-Start
- Pass-Gewährungen funktionieren jetzt korrekt nach Widerrufen
- Hängengebliebene Käufe in der Store-Warteschlange werden jetzt korrekt abgeschlossen
- Rennkalender-Zuordnung korrigiert; Bahrain wieder als R18 in Sepang eingetragen
- Neun Betriebsskripte schlagen beim Import nicht mehr stillschweigend fehl
- Das Team-SHARE-Feld wird jetzt als Steuerelement gelesen, nicht als Beschriftung
- Fehlerhafter Seeder-Import gestoppt; Kalender jetzt korrekt
- Der iOS-Build bietet die Amazon Appstore-Option nicht mehr an

## Sicherheit

- Ace-Sperre auf den Server verlagert; reine App-Implementierung entfernt
- Geteilte Geheimnisse von Amazon und Apple in den Secret Manager migriert
- Amazon-Beleg-IDs verwenden jetzt ihr eigenes Format statt das des Play Store
- Sicherheitslücken mit hohem Schweregrad in Abhängigkeiten behoben
- Alle Import-Schutzmechanismen und Escape-Klassen sind jetzt geschlossen
