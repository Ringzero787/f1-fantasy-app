# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: gestione dinamica della stagione, correzioni dei punteggi e regole eque sui contratti

## Novità

- Banner di avviso gestito dal server nel pannello Team per annunci tempestivi senza bisogno di aggiornare l'app
- Evidenziazione visiva degli slot di formazione liberi (accento tenue, bordo tratteggiato, più cerchiato)
- Il riempimento automatico ora azzera il contatore delle penalità per rosa obsoleta, come un trasferimento manuale
- Aggregatore di statistiche per amministratori per analisi giornaliere sull'utilizzo
- Nuovo tentativo automatico per i risultati di gara in sospeso con risoluzione dei nomi vettura sconosciuti
- Test end-to-end delle correzioni di gara sull'emulatore Firestore

## Modifiche

- **Modifica sostanziale:** l'app ora legge la stagione corrente dal server invece che dall'anno del dispositivo: è necessaria una nuova build per essere pronti al 2027
- La durata dei contratti è ora limitata dalle gare rimanenti in stagione e da cicli di sei gare per pilota
- Le correzioni dei risultati post-gara ricalcolano tutti i team coinvolti entro una finestra di 72 ore
- Le vendite per scadenza vengono eseguite ai prezzi post-gara, non pre-gara
- Il passaggio di stagione ora archivia il 2026, azzera team e classifiche e imposta prezzi e calendario del 2027
- La vendita del Pit Wall Pass per la prossima stagione è stata spostata a dicembre (disponibile fuori stagione)
- Gli account di test degli store sono esclusi dalle statistiche per amministratori

## Correzioni

- Rimborsate le penalità per rosa obsoleta per i team completati automaticamente a Las Vegas 2026
- Compatibilità con iOS 15.1+ (supporto Xcode 27, protezione expo-router per iOS 16)
- Le correzioni di gara e le riparazioni per scadenza ora scrivono in modo atomico con set+mergeFields
- La riparazione delle vendite per scadenza impedisce che il budget scenda sotto zero
- Il passaggio di stagione azzera i team seguendo la corretta sequenza dei prezzi
- Verifica di sicurezza delle dipendenze; rimossa l'esenzione generale GHSA

## Sicurezza

- Regole di lettura Firestore riservate agli amministratori per le statistiche aggregate
- Risolte le vulnerabilità delle dipendenze
