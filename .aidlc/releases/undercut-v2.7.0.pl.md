# uc-v2.7.0 — 2026-10-26

Undercut 2.7.0: rynek pozostaje otwarty, gdy twój skład jest zablokowany, twój Moonshot pojawia się w podsumowaniu weekendu, licznik Moonshotów liczy przy blokadzie, a wskazanie asa z Pit Wall otwiera kartę kierowcy. Po stronie serwera wyniki przychodzą teraz na czas, bo kanał pomiaru czasu jest czytany płatnym kluczem (to nie wymaga nowej wersji).

## Nowości

- **Rynek podczas blokady.** MARKET w wierszu zespołu otwiera wybieranie jako rynek tylko do odczytu przez cały weekend wyścigowy: ceny, punkty i prognozy, nic do dotknięcia. Pasek zapisu pokazuje LOCKED · AUTO-FILL ON.
- **Moonshot w podsumowaniu weekendu.** Karta między punktami weekendu a punktującymi pokazuje twój typ, miejsce kierowcy i punkty, a jedna linia sumuje skład i Moonshot w wynik weekendu. Stawka gotówkowa jest nazwana gotówką; unieważniony typ mówi, że token wrócił.
- **Wynik na żywo w dzień wyścigu, wyłączony.** Kod dla LIVE +N na każdej płytce i statystyki LIVE · SO FAR podczas wyścigu jest w tej wersji, ale nic się nie pokaże, dopóki przełącznik pomiaru czasu na żywo nie zostanie włączony po pisemnym potwierdzeniu dostawcy danych.

## Zmiany

- **Licznik Moonshotów.** Token liczy się jako wykorzystany, gdy jego typ się blokuje, a nie gdy go stawiasz, bo otwarty typ można jeszcze anulować z pełnym zwrotem: ONE IN PLAY · COUNTS WHEN SELECTIONS LOCK, potem ONE USED THIS WEEKEND.
- **Wskazanie asa na początku.** ACE CALL z Pit Wall jest pierwszym blokiem karty kierowcy, pod nazwiskiem i zespołem; gdy wskazanie dotyczy tego kierowcy, MAKE ACE · 2× POINTS jest właśnie tam, a dolny przycisk znika.
