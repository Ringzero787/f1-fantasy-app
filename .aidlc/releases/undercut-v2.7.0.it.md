# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: il mercato resta aperto mentre la tua formazione è bloccata, il tuo Moonshot compare nel riepilogo del weekend, il contatore dei Moonshot conta al blocco, e il consiglio sull'asso di Pit Wall apre la scheda del pilota. Lato server, i risultati ora arrivano in orario perché il feed dei tempi viene letto con la chiave a pagamento (per questo non serve una nuova versione).

## Novità

- **Mercato durante il blocco.** MARKET nella riga della squadra apre il selettore come mercato in sola lettura per tutto il weekend di gara: prezzi, punti e proiezioni, niente da toccare. La barra di salvataggio dice LOCKED · AUTO-FILL ON.
- **Moonshot nel riepilogo del weekend.** Una scheda tra i punti del weekend e i marcatori mostra la tua chiamata, l'arrivo del pilota e i punti, e una riga somma formazione e Moonshot nel totale del weekend. Una puntata in contanti è indicata come contanti; una annullata dice che il token è tornato.
- **Punteggio in corsa il giorno della gara, disattivato.** Il codice per un LIVE +N su ogni tessera e una statistica LIVE · SO FAR durante la gara è in questa versione, ma non compare nulla finché l'interruttore del live timing non viene acceso dopo la conferma scritta del fornitore dei tempi.

## Modifiche

- **Contatore dei Moonshot.** Un token conta come speso quando la sua chiamata si blocca, non quando la piazzi, perché una chiamata aperta può ancora essere annullata con rimborso completo: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, poi ONE USED THIS WEEKEND.
- **Il consiglio sull'asso per primo.** L'ACE CALL di Pit Wall è il primo blocco della scheda del pilota, sotto nome e squadra; quando il consiglio è di fare asso questo pilota, MAKE ACE · 2× POINTS è proprio lì e il pulsante in basso scompare.
