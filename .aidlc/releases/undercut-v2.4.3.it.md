# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: account unificati, sicurezza degli acquisti e funzionalità premium di Pit Wall.

## Novità

- Accesso multi-store: il tuo account funziona sia che tu abbia installato da Google Play, App Store o Amazon Appstore
- Condividi la classifica di lega e la tua squadra direttamente dall'app
- I diritti del Pit Wall Pass ora vengono revocati quando lo store rimborsa il tuo acquisto
- Dettaglio pilota nell'app che mostra cosa ha sbloccato il tuo pass
- Nuovo design del Pit Wall Briefing con sezione principale, barra delle previsioni e variazioni di prezzo

## Modifiche

- Il blocco Ace ora legge il calendario del server invece di quello incluso nell'app
- Le proiezioni di Pit Wall ora includono minimo, mediana, massimo, rischio di ritiro e stima del prossimo prezzo
- Il Pit Wall Pass ($14.99/stagione) è l'unico prodotto premium; League Pro deriva dal possesso del pass

## Correzioni

- **Sicurezza**: i token Play Store contraffatti non possono più acquistare pacchetti o pass a prezzi errati
- **Sicurezza**: rimosso il fallback della chiave API di produzione; nessun declassamento silenzioso in caso di errori di configurazione
- La finestra Ace ora si blocca per ogni sessione in cui assegna punti, non solo per le gare
- Il passaggio di accesso ora è vincolato al dispositivo che lo ha avviato
- Gli acquisti ora vengono assegnati una sola volta per transazione, non a ogni avvio dell'app
- L'assegnazione del pass funziona correttamente dopo una revoca
- Gli acquisti bloccati nella coda dello store ora vengono completati correttamente
- Corretta la mappatura dei round; Bahrain ripristinato a Sepang come R18
- Nove script operativi non falliscono più silenziosamente durante l'importazione
- Il campo SHARE della squadra ora viene letto come controllo, non come didascalia
- Importazione del seeder bloccata; il calendario ora è corretto
- La build iOS non propone più l'opzione Amazon Appstore

## Sicurezza

- Blocco Ace spostato sul server; rimossa l'implementazione solo lato app
- I segreti condivisi di Amazon e Apple sono stati migrati su Secret Manager
- Gli ID delle ricevute Amazon usano un formato proprio, non quello di Play Store
- Risolte le segnalazioni di sicurezza ad alta gravità sulle dipendenze
- Tutti i controlli in fase di importazione e le classi di escape ora sono chiusi
