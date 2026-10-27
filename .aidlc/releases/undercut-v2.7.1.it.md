# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: corregge l'arresto all'avvio della 2.7.0, fa raccontare al riepilogo del weekend il tuo weekend come è stato valutato, un riepilogo per squadra, e mantiene Moonshot attivo dopo un nuovo accesso.

## Corretto

- **Arresto all'avvio nella 2.7.0.** La 2.7.0 è stata compilata senza la sua configurazione web Firebase e si fermava alla schermata iniziale su ogni piattaforma. La 2.7.1 contiene le stesse funzioni compilate correttamente, e gli script di build ora rifiutano un bundle senza quella configurazione.
- **Moonshot spento dopo l'accesso.** L'app leggeva la sua configurazione una volta all'avvio, a volte prima del ripristino della sessione, e teneva i valori predefiniti per tutta la sessione: il contatore dei Moonshot, la scheda Moonshot del riepilogo e la riga del prossimo turno restavano nascosti fino a un avvio a freddo. Ora la configurazione viene riletta non appena l'accesso è noto.

## Modifiche

- **Riepilogo del weekend dal registro.** Il riepilogo mostra ora i tuoi punti come li ha valutati il server, scelta per scelta, con ACE ×2, TEAM e AUTO indicati e le scelte a 0 punti su una sola riga; FIELDED n OF 6 quando c'erano posti vuoti; la tua posizione nel turno con il distacco dal vincitore e la tua posizione stagionale con il suo movimento; il tuo Moonshot regolato con il totale del weekend; e il prossimo turno con il suo blocco e il tuo Moonshot su di esso. La scheda indica la squadra, e chi ha due squadre riceve un riepilogo per squadra.
