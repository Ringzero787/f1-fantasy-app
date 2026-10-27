# uc-v2.7.2 — 2026-10-27

Undercut 2.7.2: trzy poprawki Pick Team z wyborów na Meksyk — selektor rezerwuje najtańsze dopełnienie, więc kierowca nigdy nie zostawi cię bez konstruktora, wybory zapisują się, zanim skład będzie kompletny, a typ Pit Wall to wyróżniony wiersz zamiast plakietki na liczbach.

## Poprawiono

- **Kierowca, po którym nie starczało na konstruktora.** Kierowca liczył się jako dostępny, gdy jego cena mieściła się w pozostałej gotówce, bez odkładania czegokolwiek na wciąż wolne miejsca: czterech kierowców Pit Wall przy $65 nie zostawiało żadnego konstruktora do kupienia, a Pit Wall oznaczał dokładnie tego kierowcę, który to powodował. Wiersz jest teraz dostępny tylko wtedy, gdy najtańsze dopełnienie wolnych miejsc, z konstruktorem włącznie, dopóki żaden nie jest wybrany, nadal się po nim mieści; linia budżetu liczy konstruktora jako miejsce, a plakietka LEAVES mówi, na co są pieniądze.
- **Wybory, których nie dało się zapisać.** SAVE LINEUP czekał na pięciu kierowców i konstruktora, więc czterech wyborów nie dało się zachować bez konstruktora, na którego nie było cię stać. Zmieniony skład zapisuje się teraz taki, jaki jest, podsumowanie wymienia wolne miejsca i to, że wypełnią się same przy blokadzie, a wyjście z niezapisanymi wyborami (CANCEL, przycisk wstecz lub gest iOS) najpierw pyta.
- **Plakietka PIT WALL PICK na liczbach.** Plakietka stała obok nazwy zespołu i wchodziła pod kolumnę prognoz. Typ Pit Wall to teraz cały wiersz, wyróżniony, z etykietą w osobnej linii nad nazwiskiem; BEST VALUE i podpowiedzi doboru są w linii pod nazwą zespołu.
