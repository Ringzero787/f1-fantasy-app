# uc-v2.4.3 — 2026-10-04

Undercut 2.4.3: Zunifikowane konta, bezpieczeństwo zakupów i funkcje premium Pit Wall.

## Nowości

- Logowanie niezależne od sklepu: Twoje konto działa niezależnie od tego, czy aplikację zainstalowano z Google Play, App Store czy Amazon Appstore
- Udostępniaj tabelę ligi i swój zespół bezpośrednio z aplikacji
- Uprawnienia Pit Wall Pass są teraz cofane, gdy sklep zwróci Twoją płatność
- Szczegóły kierowcy w aplikacji pokazujące, co obejmuje zakupiony pass
- Przeprojektowany Pit Wall Briefing z sekcją główną, paskiem typów i listą zmian cen

## Zmiany

- Blokada Asa odczytuje teraz kalendarz z serwera zamiast wbudowanego
- Prognozy Pit Wall obejmują teraz wartość minimalną, medianę, maksymalną, ryzyko DNF oraz szacunki kolejnej ceny
- Pit Wall Pass (14,99 USD/sezon) jest teraz jedynym produktem premium; League Pro wynika z posiadania passu

## Poprawki

- **Bezpieczeństwo**: spreparowane tokeny Play Store nie mogą już kupować paczek ani passów po nieprawidłowych cenach
- **Bezpieczeństwo**: usunięto zapasowy klucz API produkcyjnego; błędy konfiguracji nie powodują już cichego obniżenia zabezpieczeń
- Okno Asa jest teraz blokowane dla każdej sesji punktowanej, a nie tylko dla wyścigów
- Przekazanie logowania jest teraz ograniczone do urządzenia, które je zainicjowało
- Zakupy są teraz przyznawane raz na transakcję, a nie raz na uruchomienie aplikacji
- Przyznawanie passu działa poprawnie po cofnięciu uprawnień
- Zawieszone zakupy w kolejce sklepu są teraz prawidłowo finalizowane
- Poprawiono mapowanie rund; Bahrajn przywrócono w Sepang jako R18
- Dziewięć skryptów operacyjnych nie zawodzi już po cichu przy imporcie
- Pole SHARE zespołu odczytywane jest teraz jako element sterujący, a nie podpis
- Wstrzymano import danych startowych; kalendarz jest teraz poprawny
- Wersja iOS nie oferuje już opcji Amazon Appstore

## Bezpieczeństwo

- Blokadę Asa przeniesiono na serwer; usunięto implementację działającą tylko w aplikacji
- Klucze współdzielone Amazon i Apple przeniesiono do Secret Manager
- Identyfikatory paragonów Amazon mają teraz własny format, niezgodny z formatem Play Store
- Usunięto zależności z ostrzeżeniami o wysokim stopniu zagrożenia
- Wszystkie zabezpieczenia czasu importu i klasy obejścia są teraz zamknięte
