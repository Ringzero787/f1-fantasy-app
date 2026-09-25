/**
 * Undercut localization.
 *
 * One build carries every locale bundle; there are no per-language app versions. The language is
 * chosen in this order: the player's saved preference, then the device locale, then English.
 * `bootstrap.ts` owns the wiring to stored preferences — import that, not this, at app startup.
 *
 * Adding a language: add the code to SUPPORTED in `resolve.ts` with its endonym, create the catalog
 * with `aidlc i18n sync --lang <code>`, import it below, and add it to `.aidlc/aidlc.yaml` under
 * `localization.languages` so the gate starts enforcing parity for it.
 *
 * Adding a string: put it in `locales/en.json` only, then run `aidlc i18n sync`. Never edit a
 * non-English catalog by hand — the next sync overwrites it, and the gate checks placeholder parity
 * against English.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";

import en from "./locales/en.json";
import es from "./locales/es.json";
import pt from "./locales/pt.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";

import { chooseLanguage, FALLBACK, isSupported, resolveDeviceLanguage, SUPPORTED, type LanguageCode } from "./resolve";

export { SUPPORTED, FALLBACK, isSupported, resolveDeviceLanguage, chooseLanguage };
export type { LanguageCode };

const resources = { en, es, pt, fr, de, it, nl, pl, ja, zh } as const;

export function deviceLanguage(): LanguageCode {
  try {
    return resolveDeviceLanguage(getLocales().map((l) => l.languageTag));
  } catch {
    return FALLBACK;
  }
}

/** Idempotent. `saved` is the player's stored choice, if it is already known. */
export function initI18n(saved?: string | null): typeof i18n {
  const lng = chooseLanguage(saved, (() => { try { return getLocales().map((l) => l.languageTag); } catch { return []; } })());
  if (!i18n.isInitialized) {
    i18n.use(initReactI18next).init({
      resources,
      lng,
      fallbackLng: FALLBACK,
      // React escapes for us; i18next escaping on top would double-encode apostrophes and quotes.
      interpolation: { escapeValue: false },
      returnNull: false,
      compatibilityJSON: "v4",
    });
  } else if (i18n.language !== lng) {
    void i18n.changeLanguage(lng);
  }
  return i18n;
}

export function setLanguage(code: LanguageCode): void {
  void i18n.changeLanguage(code);
}

export default i18n;
