# uc-v2.5.0 — 2026-10-07

Pronostici Moonshot, modifica del nome squadra e miglioramenti al live-timing in Undercut 2.5.0.

## Novità

- **Moonshot**: dal round 13 una squadra indietro nella sua lega può fare un call su un pilota per la gara successiva — vittoria, podio, punti o battere un rivale — mettendo in gioco parte dei punti stagionali o del budget della rosa. Un call riuscito aggiunge la ricompensa al totale stagionale; uno mancato costa la posta. Disponibile nelle viste squadra e lega, con guida alla prima apertura.
- Acquisizione dei dati di live-timing per il giorno di gara, distribuita su Firestore per aggiornamenti in tempo reale.
- Possibilità di rinominare la tua squadra e il nome visualizzato del manager dal portale Pit Wall; le modifiche si sincronizzano su tutti i tuoi dispositivi.
- Carattere tipografico Archivo nell'app, in linea con il portale web Pit Wall.

## Modifiche

- La sincronizzazione dei metadati della squadra è ora più intelligente: solo le modifiche locali del tuo dispositivo vengono caricate su Firestore, evitando che modifiche fatte altrove vengano annullate.
- Il blocco formazione mostrato nell'app ora corrisponde all'orario di blocco imposto dal server.

## Risolti

- Rafforzamento della sicurezza applicato prima del rilascio di 2.5.0.
- La creazione di una lega non concede più funzionalità a pagamento senza la licenza adeguata.
- Gli ID lega della squadra ora vengono validati come ID documento Firestore utilizzabili.
- La sincronizzazione dei metadati non sovrascrive più le copie più recenti sul server durante gli aggiornamenti periodici.
