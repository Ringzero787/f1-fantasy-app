import { launchFailsafeMs, launchTimeline, launchTotalMs, revealScale, revealScaleCurve, wordmarkLayout, WORDMARK_PX, SPLASH_U_FRACTION } from '../../src/simple/grid/launchReveal';

import * as fs from 'fs';
import * as path from 'path';

/** width and height from a PNG's IHDR chunk */
function pngSize(file: string): { width: number; height: number } {
  const b = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'launch', file));
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('launch reveal', () => {
  it('sizing constants match the generated wordmark images', () => {
    const u = pngSize('wordmark-u.png');
    const rest = pngSize('wordmark-rest.png');
    expect(u).toEqual({ width: WORDMARK_PX.uWidth, height: WORDMARK_PX.height });
    expect(rest).toEqual({ width: WORDMARK_PX.restWidth, height: WORDMARK_PX.height });
  });

  it('sizes the wordmark to 78% of a phone and keeps the artwork proportions', () => {
    const l = wordmarkLayout(400, 860);
    expect(l.uWidth + l.restWidth).toBeCloseTo(312, 5);
    expect(l.height / (l.uWidth + l.restWidth)).toBeCloseTo(WORDMARK_PX.height / (WORDMARK_PX.uWidth + WORDMARK_PX.restWidth), 8);
  });

  it('starts with the U as wide as it is on the native splash', () => {
    const l = wordmarkLayout(400, 860);
    expect(l.uWidth * l.startScale).toBeCloseTo(400 * SPLASH_U_FRACTION, 5);
  });

  it('uses the short side in landscape and caps the wordmark on tablets', () => {
    const l = wordmarkLayout(1366, 1024);
    expect(l.uWidth + l.restWidth).toBe(520);
    expect(l.uWidth * l.startScale).toBeCloseTo(1024 * SPLASH_U_FRACTION, 5);
  });

  it('never starts smaller than the final wordmark', () => {
    expect(wordmarkLayout(50, 50).startScale).toBeGreaterThanOrEqual(1);
  });

  it('never lets the unrolling wordmark pass 90% of the screen, and lands on 1', () => {
    for (const [w, h] of [[360, 640], [400, 860], [1024, 1366]]) {
      const l = wordmarkLayout(w, h);
      const { input, output } = revealScaleCurve(l, w);
      expect(output[0]).toBeCloseTo(l.startScale, 8);
      expect(output[output.length - 1]).toBe(1);
      input.forEach((p, i) => {
        expect((l.uWidth + l.restWidth * p) * output[i]).toBeLessThanOrEqual(Math.max(0.9 * w, l.uWidth + l.restWidth) + 1e-6);
        if (i > 0) expect(output[i]).toBeLessThanOrEqual(output[i - 1] + 1e-9);
        // no snap at the end: the last step is no bigger than the largest earlier step
        if (i === input.length - 1) expect(output[i - 1] - output[i]).toBeLessThanOrEqual(Math.max(...output.slice(1).map((v, k) => output[k] - v)) + 1e-9);
      });
      expect(revealScale(l, 2, w)).toBe(1);
    }
  });

  it('has a failsafe that outlasts the animation but not by long', () => {
    for (const calm of [false, true]) {
      const t = launchTimeline(calm);
      expect(launchFailsafeMs(t)).toBeGreaterThan(launchTotalMs(t));
      expect(launchFailsafeMs(t)).toBeLessThan(launchTotalMs(t) + 3000);
    }
  });

  it('is under two seconds, and reduced motion drops the movement', () => {
    expect(launchTotalMs(launchTimeline(false))).toBeLessThan(2000);
    const calm = launchTimeline(true);
    expect(calm.hold + calm.reveal).toBe(0);
    expect(launchTotalMs(calm)).toBeLessThan(1000);
  });
});
