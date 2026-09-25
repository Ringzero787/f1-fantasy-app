/**
 * Language resolution, with no native or i18next imports so it can be unit-tested directly.
 * `index.ts` wires these to expo-localization and i18next; `bootstrap.ts` wires them to stored prefs.
 */

/** Shipped languages, in the order the picker shows them. Endonyms: a player scans for their own language's native name. */
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

export const FALLBACK: LanguageCode = "en";

export function isSupported(code: string | null | undefined): code is LanguageCode {
  return !!code && SUPPORTED.some((l) => l.code === code);
}

/**
 * Best shipped language for a device's locale tags. Matches on the base language, so `pt-PT`,
 * `es-419` and `zh-Hant` land on a bundle we ship rather than falling through to English.
 */
export function resolveDeviceLanguage(tags: readonly (string | null | undefined)[]): LanguageCode {
  for (const tag of tags) {
    if (!tag) continue;
    if (isSupported(tag)) return tag;
    const base = tag.split("-")[0].toLowerCase();
    if (isSupported(base)) return base;
  }
  return FALLBACK;
}

/** The player's saved choice wins over the device; an unsupported or absent choice falls back to the device. */
export function chooseLanguage(saved: string | null | undefined, deviceTags: readonly (string | null | undefined)[]): LanguageCode {
  return isSupported(saved) ? saved : resolveDeviceLanguage(deviceTags);
}
