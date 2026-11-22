// F-167: an open slot the player can fill is highlighted; a locked or read-only one stays quiet.
import { openSlotLook } from '../../src/simple/grid/openSlotLook';
import { readFileSync } from 'fs';
import { join } from 'path';

// The palettes are read out of the source, as valuePillContrast.test.ts does: simpleTheme.ts
// imports stores Jest cannot transform here.
const SRC = readFileSync(join(__dirname, '../../src/simple/theme/simpleTheme.ts'), 'utf8');
function palette(name: string) {
  const start = SRC.indexOf(`export const ${name} = {`);
  const body = SRC.slice(start, SRC.indexOf('} as const;', start));
  const textBlock = body.slice(body.indexOf('text: {'), body.indexOf('}', body.indexOf('text: {')));
  const token = (key: string, scope = body): string => {
    const m = scope.match(new RegExp(`\\b${key}:\\s*'(#[0-9A-Fa-f]{6})'`));
    if (!m) throw new Error(`${name} has no ${key} hex token any more`);
    return m[1];
  };
  return { primary: token('primary'), primaryFaint: token('primaryFaint'), borderStrong: token('borderStrong'), text: { primary: token('primary', textBlock), muted: token('muted', textBlock) } };
}
const lightColors = palette('S_COLORS_LIGHT');
const darkColors = palette('S_COLORS_DARK');

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe.each([['light', lightColors], ['dark', darkColors]] as const)('openSlotLook (%s)', (_name, colors) => {
  it('highlights a slot the player can fill', () => {
    const look = openSlotLook(colors, false);
    expect(look).toMatchObject({ open: true, ring: true, borderColor: colors.primary, backgroundColor: colors.primaryFaint, accent: colors.primary });
    expect(look.borderWidth).toBeGreaterThan(1);
  });
  it('keeps a locked or read-only slot quiet', () => {
    expect(openSlotLook(colors, true)).toEqual({ open: false, ring: false, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'transparent', accent: colors.text.muted, label: colors.text.muted });
  });
  it('keeps the small labels at AA contrast on the wash', () => {
    const look = openSlotLook(colors, false);
    expect(contrast(look.label, look.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
});
