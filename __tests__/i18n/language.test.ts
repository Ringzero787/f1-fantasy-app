/**
 * Language resolution and catalog integrity. Imports src/i18n/resolve (no native modules) and the
 * catalogs directly, so this runs under the plain node jest environment.
 */
import fs from 'fs';
import path from 'path';
import { SUPPORTED, FALLBACK, chooseLanguage, isSupported, resolveDeviceLanguage } from '../../src/i18n/resolve';

const localesDir = path.join(__dirname, '..', '..', 'src', 'i18n', 'locales');
const load = (code: string) => JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8'));
const flatten = (o: any, p = '', out: string[] = []): string[] => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (typeof v === 'string') out.push(key);
    else if (v && typeof v === 'object') flatten(v, key, out);
  }
  return out;
};
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe('device language resolution', () => {
  it('matches a regional tag onto the base language we ship', () => {
    expect(resolveDeviceLanguage(['pt-BR'])).toBe('pt');
    expect(resolveDeviceLanguage(['pt-PT'])).toBe('pt');
    expect(resolveDeviceLanguage(['es-419'])).toBe('es');
    expect(resolveDeviceLanguage(['zh-Hant-TW'])).toBe('zh');
  });

  it('takes the first supported tag and ignores ones we do not ship', () => {
    expect(resolveDeviceLanguage(['ko-KR', 'de-DE'])).toBe('de');
    expect(resolveDeviceLanguage(['ko-KR'])).toBe(FALLBACK);
    expect(resolveDeviceLanguage([])).toBe(FALLBACK);
    expect(resolveDeviceLanguage([null, undefined, ''])).toBe(FALLBACK);
  });
});

describe('saved preference', () => {
  it('wins over the device locale', () => {
    expect(chooseLanguage('ja', ['en-US'])).toBe('ja');
    expect(chooseLanguage('en', ['ja-JP'])).toBe('en');
  });

  it('falls back to the device when absent or not shipped', () => {
    expect(chooseLanguage(null, ['it-IT'])).toBe('it');
    expect(chooseLanguage(undefined, ['fr-CA'])).toBe('fr');
    expect(chooseLanguage('ko', ['nl-NL'])).toBe('nl');
    expect(isSupported('ko')).toBe(false);
  });
});

describe('catalogs', () => {
  const en = load('en');
  const enKeys = flatten(en);

  it('ships a catalog for every supported language', () => {
    for (const { code } of SUPPORTED) {
      expect(fs.existsSync(path.join(localesDir, `${code}.json`))).toBe(true);
    }
  });

  it('covers every non-plural English key in every language', () => {
    const singular = enKeys.filter((k) => !PLURAL.test(k));
    for (const { code } of SUPPORTED) {
      if (code === 'en') continue;
      const keys = new Set(flatten(load(code)));
      expect({ code, missing: singular.filter((k) => !keys.has(k)) }).toEqual({ code, missing: [] });
    }
  });

  it('gives every language at least the `other` plural form for each plural group', () => {
    const bases = [...new Set(enKeys.filter((k) => PLURAL.test(k)).map((k) => k.replace(PLURAL, '')))];
    expect(bases.length).toBeGreaterThan(0);
    for (const { code } of SUPPORTED) {
      const keys = new Set(flatten(load(code)));
      for (const base of bases) expect(`${code}:${base}_other`).toBe(keys.has(`${base}_other`) ? `${code}:${base}_other` : 'MISSING');
    }
  });

  it('keeps placeholders identical to English', () => {
    const ph = (s: string) => (s.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((x) => x.replace(/\s/g, '')).sort().join(',');
    const get = (o: any, k: string) => k.split('.').reduce((a, p) => a?.[p], o);
    for (const { code } of SUPPORTED) {
      if (code === 'en') continue;
      const cat = load(code);
      for (const key of enKeys) {
        const translated = get(cat, key);
        if (typeof translated !== 'string') continue;
        expect(`${code}.${key}:${ph(translated)}`).toBe(`${code}.${key}:${ph(get(en, key))}`);
      }
    }
  });
});
