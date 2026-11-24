# uc-v2.9.0 — 2026-11-24

Undercut 2.9.0: dynamiczne rozpoznawanie sezonu, korekty punktacji i sprawiedliwe zasady kontraktów

## Dodano

- Baner z powiadomieniami sterowany przez serwer w panelu Drużyny, umożliwiający aktualne ogłoszenia bez konieczności aktualizacji aplikacji
- Wizualne wyróżnienie wolnego miejsca w składzie (delikatny akcent, przerywana ramka, plus w okręgu)
- Automatyczne uzupełnianie składu resetuje teraz licznik kar za nieaktualny skład tak samo jak ręczny transfer
- Agregator statystyk administracyjnych do codziennej analizy użycia
- Automatyczne ponawianie prób dla wstrzymanych wyników wyścigu z rozwiązywaniem nieznanych nazw bolidów
- Kompleksowe testy korekt wyścigów na emulatorze Firestore

## Zmieniono

- **Zmiana krytyczna:** Aplikacja odczytuje teraz aktualny sezon z serwera zamiast z roku ustawionego na urządzeniu — wymagane przebudowanie aplikacji w celu przygotowania do sezonu 2027
- Długość kontraktu jest teraz ograniczona liczbą pozostałych wyścigów w sezonie oraz sześciowyścigowymi okresami kierowców
- Korekty wyników po wyścigu ponownie oceniają wszystkie dotknięte drużyny w oknie 72 godzin
- Sprzedaż po wygaśnięciu kontraktu odbywa się po cenach obowiązujących po wyścigu, a nie przed nim
- Przejście na nowy sezon archiwizuje teraz sezon 2026, resetuje drużyny i klasyfikacje oraz ustawia ceny i kalendarz na 2027 rok
- Sprzedaż Pit Wall Pass na kolejny sezon przeniesiona na grudzień (dostępność w okresie międzysezonowym)
- Konta testowe sklepu wykluczone ze statystyk administracyjnych

## Naprawiono

- Zwrócono kary za nieaktualny skład dla drużyn automatycznie uzupełnionych podczas Las Vegas 2026
- Zgodność z iOS 15.1+ (wsparcie dla Xcode 27, zabezpieczenie expo-router dla iOS 16)
- Korekty wyścigów i naprawa wygasłych kontraktów zapisują teraz dane atomowo za pomocą set+mergeFields
- Naprawa sprzedaży po wygaśnięciu kontraktu zapobiega spadkowi budżetu poniżej zera
- Przejście na nowy sezon resetuje drużyny z zachowaniem poprawnej kolejności cen
- Przegląd bezpieczeństwa zależności; usunięto ogólne zwolnienie GHSA

## Bezpieczeństwo

- Reguły odczytu Firestore dostępne wyłącznie dla administratorów dotyczące zagregowanych statystyk
- Usunięto podatności w zależnościach
