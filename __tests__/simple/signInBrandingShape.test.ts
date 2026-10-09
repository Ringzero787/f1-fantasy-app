/**
 * The sign-in buttons follow each provider's button rules, pinned as a shape (F-108 follow-up).
 *
 * They had drifted into the app's own style: a one-colour icon-set "G", a shopping cart for
 * Amazon, and every label in capitals in the display face. The first repair then drew Google's
 * previous four-colour G from memory, which Google's rules also forbid ("an outdated Google G").
 * So the artwork is the providers' own files, and this checks that it stays that way. Rendering
 * the screen in jest needs the native sign-in modules, so it reads the composition off the source.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'src/simple/grid/GridAuthBits.tsx'), 'utf8');
const pngSize = (p: string) => {
  const b = fs.readFileSync(path.join(root, p));
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('sign-in buttons use the providers\' own artwork and wording', () => {
  it('Google: the G is the bundled file, at every density, and nothing draws one', () => {
    expect(src).toMatch(/GOOGLE_G = require\('[./]+assets\/signin\/google-g\.png'\)/);
    expect(src).toMatch(/source=\{GOOGLE_G\}/);
    expect(src).not.toContain('logo-google');
    expect(src).not.toMatch(/GoogleGMark|<Svg|<Path/);
    expect(pngSize('assets/signin/google-g.png')).toEqual([20, 20]);
    expect(pngSize('assets/signin/google-g@2x.png')).toEqual([40, 40]);
    expect(pngSize('assets/signin/google-g@3x.png')).toEqual([60, 60]);
    expect(pngSize('assets/signin/google-g@4x.png')).toEqual([80, 80]);
    // the guidelines' light button
    expect(src).toMatch(/pill\('#FFFFFF', '#747775', '#1F1F1F'/);
    expect(src).toContain("'Continue with Google'");
  });

  it('Apple: the system button on iOS, wired to the same handler; a one-colour custom button elsewhere', () => {
    const native = src.match(/<AppleAuthentication\.AppleAuthenticationButton[\s\S]*?\/>/)?.[0];
    expect(native).toBeDefined();
    expect(native).toContain('AppleAuthenticationButtonType.CONTINUE');
    expect(native).toMatch(/isDark \? [\w.]*\.WHITE : [\w.]*\.BLACK/);
    expect(native).toMatch(/onPress=\{once\(apple\)\}/);
    expect(src).toMatch(/Platform\.OS === 'ios'\s*\?\s*appleNative\(\)/);
    expect(src).toContain("'Continue with Apple'");
  });

  it('Amazon: its supplied button image at its own proportions, not a cart and not a drawn pill', () => {
    expect(src).toMatch(/AMAZON_BUTTON = require\('[./]+assets\/signin\/login-with-amazon\.png'\)/);
    expect(src).toContain('AMAZON_BUTTON_ASPECT = 195 / 46');
    expect(pngSize('assets/signin/login-with-amazon.png')).toEqual([195, 46]);
    expect(pngSize('assets/signin/login-with-amazon@2x.png')).toEqual([390, 92]);
    expect(src).not.toMatch(/name="(cart|logo-amazon)"/);
    expect(src).not.toContain('#FF9900');
  });

  it('the three are one height, so none is smaller than another', () => {
    // the custom pill and the Amazon image take the shared height; Apple's frame is a touch
    // taller because the system button draws itself inset
    expect((src.match(/height: pillHeight/g) ?? []).length).toBe(2);
    expect(src).toMatch(/const appleFrame = Math\.round\(pillHeight \* 1\.0\d+\)/);
    expect(src).toContain('height: appleFrame');
    expect(src).not.toContain('minHeight: pillHeight');
  });

  it('no label is in capitals, transformed to capitals, or in the display face', () => {
    const block = src.slice(src.indexOf('const pillHeight'), src.indexOf('// Which pills'));
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toMatch(/textTransform|family\.|fontFamily|letterSpacing/);
    for (const label of block.match(/'[^']*(?:with|in)[^']*'/g) ?? []) expect(label).not.toBe(label.toUpperCase());
  });
});
