/**
 * Does a key actually come back as a sentence?
 *
 * The catalog tests next door check the JSON files against each other and were all passing while
 * every screen rendered raw keys ("AUTH.SIGNIN.TITLE") on device: the catalogs were fine, the wiring
 * that hands them to i18next was not. This test initialises i18next the way the app does and asserts
 * that real keys resolve, which is the only thing the player actually sees.
 *
 * expo-localization is a native module with no JS fallback under the node environment, so it is
 * mocked here; language resolution itself is covered by language.test.ts.
 */
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }], getCalendars: () => [] }));

import fs from 'fs';
import path from 'path';
import { initI18n } from '../../src/i18n';
import { SUPPORTED } from '../../src/i18n/resolve';

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
/** i18next picks the form by count, so a bare plural key is not expected to resolve on its own. */
const PLURAL = /_(zero|one|two|few|many|other)$/;

describe('translation', () => {
  const i18n = initI18n('en');

  it('resolves the sign-in screen rather than echoing the key', () => {
    expect(i18n.t('auth.signIn.title')).toBe('Welcome');
    expect(i18n.t('auth.signIn.subtitle')).toBe(load('en').auth.signIn.subtitle);
    expect(i18n.t('auth.signIn.title')).not.toBe('auth.signIn.title');
  });

  it('resolves every English key, in every top-level section', () => {
    const keys = flatten(load('en')).filter((k) => !PLURAL.test(k));
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => i18n.t(k) === k)).toEqual([]);
  });

  it('resolves in every language we ship, and gives a different string than English', () => {
    const probe = 'auth.signIn.title';
    const en = load('en');
    for (const { code } of SUPPORTED) {
      i18n.changeLanguage(code);
      const got = i18n.t(probe);
      expect({ code, got }).toEqual({ code, got: load(code).auth.signIn.title });
      if (code !== 'en') expect(got).not.toBe(en.auth.signIn.title);
    }
    i18n.changeLanguage('en');
  });

  it('falls back to English for a key a language is missing rather than showing the key', () => {
    i18n.changeLanguage('de');
    expect(i18n.t('auth.signIn.title')).not.toBe('auth.signIn.title');
    i18n.changeLanguage('en');
  });
});
