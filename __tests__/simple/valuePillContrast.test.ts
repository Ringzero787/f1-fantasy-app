import { readFileSync } from 'fs';
import { join } from 'path';

// The field report that produced ValuePill was "my budget is on black and the text is
// un-visable". The fix is a colour choice, so the only thing that can stop it coming back is a
// measurement. Every colour ValuePill puts on its own `card` background is checked here against
// the WCAG AA floor for normal text — including the `caution` tone, which is the one that was
// below it (#B45309 on #E8E8E5 measures 4.09:1).
//
// The palettes are read out of the source rather than imported: simpleTheme.ts imports the prefs
// and remote-config stores, which Jest cannot transform here. Reading the file has the side
// benefit of failing if the tokens are renamed or removed, not only if they are recoloured.

const SRC = readFileSync(join(__dirname, '../../src/simple/theme/simpleTheme.ts'), 'utf8');

function palette(name: string): { card: string; warning: string; negative: string; primary: string; secondary: string } {
  const start = SRC.indexOf(`export const ${name} = {`);
  expect(start).toBeGreaterThan(-1);
  const body = SRC.slice(start, SRC.indexOf('} as const;', start));
  const token = (key: string, scope = body): string => {
    const m = scope.match(new RegExp(`\\b${key}:\\s*'(#[0-9A-Fa-f]{6})'`));
    if (!m) throw new Error(`${name} has no ${key} hex token any more`);
    return m[1];
  };
  const textBlock = body.slice(body.indexOf('text: {'), body.indexOf('}', body.indexOf('text: {')));
  return {
    card: token('card'),
    warning: token('warning'),
    negative: token('negative'),
    primary: token('primary', textBlock),
    secondary: token('secondary', textBlock),
  };
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const parts = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = parts.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe('ValuePill is legible in both themes', () => {
  for (const name of ['S_COLORS_DARK', 'S_COLORS_LIGHT']) {
    // What ValuePill renders: the label in text.secondary, the value in text.primary, or in
    // `warning` when the budget is low — all three on `card`.
    for (const [what, key] of [
      ['label (text.secondary)', 'secondary'],
      ['value, normal tone (text.primary)', 'primary'],
      ['value, caution tone (warning)', 'warning'],
    ] as const) {
      it(`${name}: ${what} clears AA on card`, () => {
        const c = palette(name);
        expect(contrast(c[key], c.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      });
    }

    it(`${name}: the caution tone is not the error colour`, () => {
      // The report asked for a contrast colour explicitly "(not red)".
      const c = palette(name);
      expect(c.warning).not.toBe(c.negative);
    });
  }
});
