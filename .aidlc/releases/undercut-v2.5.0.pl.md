# uc-v2.5.0 — 2026-10-07

Prognozy wyścigowe Moonshot, edycja nazwy zespołu i usprawnienia pomiaru czasu na żywo w Undercut 2.5.0.

## Dodano

- **Moonshot**: od rundy 13 drużyna, która traci do rywali w swojej lidze, może złożyć jeden call na kierowcę w najbliższym wyścigu — zwycięstwo, podium, punkty lub pokonanie rywala — stawiając część punktów sezonu lub budżetu składu. Trafienie dodaje nagrodę do sumy sezonu; chybienie kosztuje stawkę. Dostępne w widokach drużyny i ligi, z przewodnikiem przy pierwszym użyciu.
- Pobieranie danych pomiaru czasu na żywo w dniu wyścigu, rozproszone w Firestore dla aktualizacji w czasie rzeczywistym.
- Możliwość zmiany nazwy zespołu i wyświetlanej nazwy menedżera z poziomu portalu Pit Wall; zmiany synchronizują się na wszystkich urządzeniach.
- Krój pisma Archivo w aplikacji, zgodny z portalem internetowym Pit Wall.

## Zmieniono

- Synchronizacja metadanych zespołu jest teraz sprytniejsza: do Firestore wysyłane są tylko lokalne zmiany z Twojego urządzenia, co zapobiega cofaniu edycji wprowadzonych gdzie indziej.
- Blokada składu wyświetlana w aplikacji odpowiada teraz czasowi blokady wymuszanemu przez serwer.

## Naprawiono

- Wprowadzono dodatkowe zabezpieczenia po przeglądzie bezpieczeństwa przed wydaniem 2.5.0.
- Tworzenie ligi nie przyznaje już płatnych funkcji bez odpowiedniej licencji.
- Identyfikatory lig zespołu są teraz weryfikowane jako prawidłowe identyfikatory dokumentów Firestore.
- Synchronizacja metadanych nie nadpisuje już nowszych kopii z serwera podczas okresowych aktualizacji.
