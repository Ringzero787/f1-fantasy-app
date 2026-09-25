/**
 * Undercut localization.
 *
 * One build carries every locale bundle; there are no per-language app versions. The language is
 * chosen in this order: the player's saved preference, then the device locale, then English.
 *
 * Adding a language: add the code to SUPPORTED with its endonym, create the catalog with
 * `aidlc i18n sync --lang <code>`, import it below, and add it to `.aidlc/aidlc.yaml` under
 * `localization.languages` so the gate starts enforcing parity for it.
 *
 * Adding a string: put it in `locales/en.json` only, then run `aidlc i18n sync`. Never edit a
 * non-English catalog by hand — the next sync would overwrite it, and the gate checks placeholder
 * parity against English.
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

/** Shipped languages, in the order the picker shows them. Endonyms: a player looking for their own language scans for its native name. */
export const SUPPORTED = [
  { code: "en", label: "English" },
  { code: "es", label: "Espanol" },
  { code: "pt", label: "Portugues" },
  { code: "fr", label: "Francais" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "pl", label: "Polski" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
] as const;

export type LanguageCode = (typeof SUPPORTED)[number]["code"];

const resources = { en, es, pt, fr, de, it, nl, pl, ja, zh } as const;

export const FALLBACK: LanguageCode = "en";

/**
 * Best shipped language for a set of device locale tags. Matches the base language, so `pt-PT`,
 * `es-419` and `zh-Hant` all land on a bundle we ship rather than falling through to English.
 */
export function resolveDeviceLanguage(tags: readonly string[]): LanguageCode {
  const codes = new Set(SUPPORTED.map((l) => l.code as string));
  for (const tag of tags) {
    if (!tag) continue;
    if (codes.has(tag)) return tag as LanguageCode;
    const base = tag.split("-")[0].toLowerCase();
    if (codes.has(base)) return base as LanguageCode;
  }
  return FALLBACK;
}

export function deviceLanguage(): LanguageCode {
  try {
    return resolveDeviceLanguage(getLocales().map((l) => l.languageTag));
  } catch {
    return FALLBACK;
  }
}

let started = false;

/** Called once from the root layout, before anything renders text. `saved` is the player's stored choice, if any. */
export function initI18n(saved?: string | null): typeof i18n {
  const lng = saved && SUPPORTED.some((l) => l.code === saved) ? saved : deviceLanguage();
  if (!started) {
    started = true;
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
