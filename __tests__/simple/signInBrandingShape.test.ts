/**
 * The sign-in buttons follow each provider's button rules, pinned as a shape (F-108 follow-up).
 *
 * They had drifted into the app's own style: a one-colour icon-set "G", a shopping cart for
 * Amazon, and every label in capitals in the display face. Each of those is something the
 * provider's branding rules rule out, and Apple's can cost a review. Rendering the screen in
 * jest needs the native sign-in modules, so this reads the composition off the source.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const src = read('src/simple/grid/GridAuthBits.tsx');

describe('sign-in buttons use the providers\' own marks and wording', () => {
  it('Google: the four-colour G on the light button, never a recoloured glyph', () => {
    expect(src).toContain("<GoogleGMark size={markSize} />, 'Continue with Google'");
    expect(src).not.toContain('logo-google');
    expect(src).toContain("pill('#FFFFFF', '#747775', '#1F1F1F'");
    const mark = read('src/simple/grid/GoogleGMark.tsx');
    for (const colour of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) expect(mark).toContain(colour);
  });

  it('Apple: the system button on iOS, a one-colour custom button elsewhere', () => {
    expect(src).toContain('AppleAuthentication.AppleAuthenticationButton');
    expect(src).toContain('AppleAuthenticationButtonType.CONTINUE');
    expect(src).toMatch(/Platform\.OS === 'ios'\s*\?\s*appleNative\(\)/);
    expect(src).toContain("'Continue with Apple'");
  });

  it('Amazon: its own mark and wording, not a cart', () => {
    expect(src).toContain('name="logo-amazon"');
    expect(src).toContain("'Login with Amazon'");
    expect(src).not.toContain('name="cart"');
  });

  it('no button label is set in capitals or in the display face', () => {
    expect(src).not.toMatch(/'(CONTINUE WITH|LOGIN WITH|SIGNING IN)/);
    const pill = src.match(/const pill = [\s\S]*?<\/Pressable>/)?.[0];
    expect(pill).toBeDefined();
    expect(pill).not.toContain('family.ui');
    expect(pill).not.toContain('letterSpacing');
  });
});
