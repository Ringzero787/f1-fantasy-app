# uc-v2.8.0 — 2026-11-14

Undercut 2.8.0: Pit Wall plant den Rest deines Teams aus deinen ersten Picks und schlägt beim Bestätigen dein Ass vor, dazu die Korrekturen aus dem letzten Playtest: Ein bezahlbarer Fahrer wird nie gesperrt, jeder Fahrer im Markt zeigt seine Details, und Teamnamen stehen vorn.

## Neu

- **Pit-Wall-Strategien.** Deine ersten Fahrer zeigen Pit Wall, wie du baust: ein Fahrer aus dem oberen Preisdrittel heißt STARS, nur günstige Fahrer heißen VALUE, alles andere BALANCED. Ein PIT WALL STRATEGY-Streifen im Fahrer-Tab lässt dich wechseln, und die Fahrer im Plan für deine freien Plätze tragen PIT WALL PLAN, innerhalb deines Budgets nach dem günstigsten Konstrukteur.
- **Ass-Tipp beim Bestätigen.** Wenn du ein vollständiges Team speicherst, öffnet sich der Ass-Tipp von Pit Wall, sobald du wieder bei deinem Team bist.

## Geändert

- **Teamnamen zuerst.** Dein Teamname steht groß vorn, der Spielername klein darunter, im Grid, in Ligen und im Rundenbericht. Der Moonshot-Feed der Liga ist eine Zeile: MOONSHOT +N POINTS · TEAM.
- **Startnummern** sind größer, fett und in Teamfarben auf den Team- und Ligakacheln.
- **Pit Wall ist gold.** Tipp-Zeile, Ass-Tipp, Analyse und Pass-Zeilen sind gold statt rot; Rot steht jetzt für schlechte Zahlen, Warnungen sind orange.
- **Ein gesperrtes Team sagt, wann es wieder öffnet.** Nach einem Rennen zeigt die Kopfzeile RESULTS PENDING, REOPENS IN … oder REOPENING SOON statt eines Countdowns über gesperrten Zeilen, und dein Team wird neu gelesen, wenn du zurückkommst.

## Behoben

- **Ein bezahlbarer Fahrer, den du nicht kaufen konntest.** 2.7.2 sperrte jeden Fahrer, der zu wenig für den günstigsten Abschluss übrig ließ, also kaufte $18 Guthaben keinen $5-Fahrer. Ein bezahlbarer Fahrer lässt sich jetzt immer kaufen; einer, der zu wenig übrig lässt, wird als TIGHT · LEAVES TOO LITTLE FOR THE REST markiert.
- **Marktdetails außerhalb des Bearbeitens.** Gesperrte oder nicht verfügbare Marktzeilen öffnen ein Detailblatt zum Lesen, und langes Drücken öffnet es auf jeder Zeile.
- **„JR“ als Nachname.** Namen mit Jr., Sr. oder einer Ziffer zeigen den echten Nachnamen.
