# uc-v2.8.0 — 2026-11-14

Undercut 2.8.0: Pit Wall planuje resztę składu na podstawie pierwszych wyborów i podpowiada asa przy zatwierdzeniu, a do tego poprawki z ostatnich testów: kierowcy, na którego cię stać, nic nie blokuje, każdy kierowca na rynku otwiera szczegóły, a nazwy zespołów są na pierwszym miejscu.

## Nowości

- **Strategie Pit Wall.** Pierwsi dodani kierowcy mówią Pit Wall, jak budujesz skład: kierowca z najdroższej jednej trzeciej to STARS, tylko tani kierowcy to VALUE, wszystko inne to BALANCED. Pasek PIT WALL STRATEGY na karcie kierowców pozwala zmienić strategię, a kierowcy z planu na wolne miejsca mają oznaczenie PIT WALL PLAN, w ramach budżetu po najtańszym konstruktorze.
- **As przy zatwierdzeniu.** Zapisanie pełnego składu otwiera podpowiedź asa Pit Wall, gdy tylko wrócisz do swojego zespołu.

## Zmiany

- **Najpierw nazwa zespołu.** Nazwa twojego zespołu jest duża, a imię gracza małe pod nią, w Grid, w ligach i w raporcie rundy. Kanał Moonshot ligi to jedna linia: MOONSHOT +N POINTS · TEAM.
- **Numery samochodów** są większe, pogrubione i w barwach zespołu na kafelkach zespołu i ligi.
- **Pit Wall jest złoty.** Pasek wyboru, podpowiedź asa, analiza i wiersze Pass są złote zamiast czerwonych; czerwień oznacza teraz zły wynik, a ostrzeżenia są pomarańczowe.
- **Zablokowany skład mówi, kiedy się otworzy.** Po wyścigu nagłówek pokazuje RESULTS PENDING, REOPENS IN … lub REOPENING SOON zamiast odliczania nad zablokowanymi wierszami, a zespół jest wczytywany ponownie, gdy do niego wracasz.

## Poprawki

- **Kierowca w zasięgu budżetu, którego nie dało się kupić.** Wersja 2.7.2 blokowała każdego kierowcę, który zostawiał za mało na najtańsze uzupełnienie, więc za $18 nie dało się kupić kierowcy za $5. Kierowcę, na którego cię stać, zawsze można teraz kupić; ten, który zostawia za mało, ma oznaczenie TIGHT · LEAVES TOO LITTLE FOR THE REST.
- **Szczegóły rynku poza edycją.** Zablokowane lub niedostępne wiersze rynku otwierają arkusz szczegółów tylko do odczytu, a długie przytrzymanie otwiera go na każdym wierszu.
- **„JR” jako nazwisko.** Imiona z Jr., Sr. lub liczebnikiem pokazują prawdziwe nazwisko.
