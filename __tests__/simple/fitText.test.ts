import { fitFontSize, WORDMARK_EM_WIDTH, WORDMARK_MEASURED_EM } from '../../src/simple/grid/fitText';

// what the wordmark really takes at a size, from the simulator measurement, not from the constant under test
const drawn = (size: number) => size * WORDMARK_MEASURED_EM;

describe('fitFontSize', () => {
  it('keeps the target size when the run fits', () => {
    // iPhone 17 Pro at display size M: 402 wide, 24 gutters, 40pt wordmark
    expect(fitFontSize(40, 402 - 48, WORDMARK_EM_WIDTH)).toBe(40);
  });

  it('the constant leaves real headroom over the measured width', () => {
    expect(WORDMARK_EM_WIDTH / WORDMARK_MEASURED_EM).toBeGreaterThanOrEqual(1.04);
  });

  it.each([
    ['iPhone 402 at XXL', 60, 402 - 72],
    ['Android 360 at XXL', 60, 360 - 72],
    ['320-wide phone at M', 40, 320 - 48],
    ['320-wide phone at XXL', 60, 320 - 72],
  ])('%s: the measured wordmark fits its row with margin', (_name, target, row) => {
    const size = fitFontSize(target, row, WORDMARK_EM_WIDTH);
    expect(size).toBeLessThanOrEqual(target);
    expect(drawn(size)).toBeLessThanOrEqual(row * 0.97);
  });

  it('a larger system text size shrinks the set size so the drawn size still fits', () => {
    // GridAuthBits divides the row by fontScale; the OS then multiplies the size back up
    const row = 402 - 48;
    const fontScale = 1.35;
    const size = fitFontSize(40, row / fontScale, WORDMARK_EM_WIDTH);
    expect(size).toBeLessThan(40);
    expect(drawn(size) * fontScale).toBeLessThanOrEqual(row);
  });

  it('falls back to the target on a width it cannot use', () => {
    expect(fitFontSize(40, 0, WORDMARK_EM_WIDTH)).toBe(40);
    expect(fitFontSize(40, NaN, WORDMARK_EM_WIDTH)).toBe(40);
  });
});
