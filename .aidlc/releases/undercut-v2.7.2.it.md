# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2: tre correzioni a Pick Team nate dalle scelte per il Messico — il selettore trattiene il completamento più economico così un pilota non ti lascia mai senza costruttore, le tue scelte si salvano prima che la formazione sia completa, e il consiglio di Pit Wall è una riga evidenziata invece di un badge sopra i numeri.

## Corretto

- **Un pilota che non lasciava spazio a un costruttore.** Un pilota contava come abbordabile se il suo prezzo stava nei soldi rimasti, senza trattenere nulla per i posti ancora liberi: quattro piloti Pit Wall con $65 non lasciavano nessun costruttore acquistabile, e Pit Wall segnava proprio il pilota che lo causava. Ora una riga è abbordabile solo se il completamento più economico dei posti liberi, costruttore compreso finché non ne è scelto uno, ci sta ancora dopo; la riga del budget conta il costruttore come un posto e il badge LEAVES dice a cosa servono i soldi.
- **Scelte che non si potevano salvare.** SAVE LINEUP aspettava cinque piloti e un costruttore, quindi quattro scelte non si potevano tenere senza un costruttore che non potevi permetterti. Una formazione modificata ora si salva così com'è, il riepilogo nomina i posti ancora liberi e dice che si riempiono da soli al blocco, e uscire con scelte non salvate (CANCEL, il tasto indietro o il gesto iOS) chiede prima.
- **Il badge PIT WALL PICK sopra i numeri.** Il badge stava accanto al nome della squadra e finiva sotto la colonna delle proiezioni. Il consiglio di Pit Wall è ora l'intera riga, evidenziata, con l'etichetta su una riga propria sopra il nome; BEST VALUE e i suggerimenti di abbinamento stanno su una riga sotto il nome della squadra.
