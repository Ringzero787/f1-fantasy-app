# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2: drei Korrekturen an Pick Team aus den Mexiko-Picks — der Picker hält den günstigsten Abschluss zurück, sodass ein Fahrer dich nie ohne Konstrukteur zurücklässt, deine Picks werden gespeichert, bevor das Team vollständig ist, und der Tipp von Pit Wall ist eine hervorgehobene Zeile statt eines Abzeichens über den Werten.

## Behoben

- **Ein Fahrer, der keinen Platz für einen Konstrukteur ließ.** Ein Fahrer galt als bezahlbar, sobald sein Preis ins verbleibende Geld passte, ohne dass etwas für die offenen Plätze zurückgehalten wurde: Vier Pit-Wall-Fahrer bei $65 ließen keinen Konstrukteur übrig, den du kaufen konntest, und Pit Wall markierte genau den Fahrer, der das verursachte. Eine Zeile ist jetzt nur bezahlbar, wenn der günstigste Abschluss der offenen Plätze, Konstrukteur eingeschlossen, solange keiner gewählt ist, danach noch passt; die Budgetzeile zählt den Konstrukteur als Platz, und das LEAVES-Abzeichen sagt, wofür das Geld ist.
- **Picks, die sich nicht speichern ließen.** SAVE LINEUP wartete auf fünf Fahrer und einen Konstrukteur, also ließen sich vier Picks nicht behalten, ohne einen Konstrukteur, den du dir nicht leisten konntest. Ein geändertes Team wird jetzt so gespeichert, wie es ist, die Zusammenfassung nennt die offenen Plätze und dass sie bei der Sperre automatisch gefüllt werden, und wer mit ungespeicherten Picks geht (CANCEL, Zurück-Taste oder iOS-Wischgeste), wird zuerst gefragt.
- **Das PIT WALL PICK-Abzeichen über den Werten.** Das Abzeichen saß neben dem Teamnamen und lief unter die Prognose-Spalte. Der Tipp von Pit Wall ist jetzt die ganze Zeile, hervorgehoben, mit der Beschriftung in einer eigenen Zeile über dem Namen; BEST VALUE und die Kombinationshinweise stehen in einer Zeile unter dem Teamnamen.
