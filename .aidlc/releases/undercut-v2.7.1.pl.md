# uc-v2.7.1 — 2026-10-27

Undercut 2.7.1: naprawia awarię przy uruchomieniu w 2.7.0, sprawia, że podsumowanie weekendu opowiada twój weekend tak, jak został policzony, jedno podsumowanie na zespół, i utrzymuje Moonshot włączony po ponownym zalogowaniu.

## Poprawiono

- **Awaria przy uruchomieniu w 2.7.0.** 2.7.0 zbudowano bez konfiguracji webowej Firebase i aplikacja zatrzymywała się na ekranie startowym na każdej platformie. 2.7.1 to te same funkcje zbudowane poprawnie, a skrypty budowania odmawiają teraz utworzenia pakietu bez tej konfiguracji.
- **Moonshot wyłączony po zalogowaniu.** Aplikacja odczytywała konfigurację raz przy starcie, czasem zanim sesja została przywrócona, i zachowywała wartości domyślne przez całą sesję: licznik Moonshotów, karta Moonshot w podsumowaniu i wiersz następnej rundy pozostawały ukryte do zimnego startu. Konfiguracja jest teraz odczytywana ponownie, gdy tylko logowanie jest znane.

## Zmiany

- **Podsumowanie weekendu z zapisu.** Podsumowanie pokazuje teraz twoje punkty tak, jak policzył je serwer, wybór po wyborze, z oznaczeniami ACE ×2, TEAM i AUTO oraz wyborami z 0 punktów w jednym wierszu; FIELDED n OF 6, gdy były wolne miejsca; twoje miejsce w rundzie ze stratą do zwycięzcy i miejsce w sezonie z jego zmianą; rozliczony Moonshot z sumą weekendu; i następną rundę z jej blokadą i twoim Moonshotem na nią. Karta podaje nazwę zespołu, a gracz z dwoma zespołami dostaje podsumowanie dla każdego z nich.
