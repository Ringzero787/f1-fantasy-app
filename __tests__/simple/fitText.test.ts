import { fitFontSize, WORDMARK_EM_WIDTH } from '../../src/simple/grid/fitText';

describe('fitFontSize', () => {
  it('keeps the target size when the run fits', () => {
    // iPhone 17 Pro at display size M: 402 wide, 24 gutters, 40pt wordmark
    expect(fitFontSize(40, 402 - 48, WORDMARK_EM_WIDTH)).toBe(40);
  });
  it('steps down so the wordmark stays on one line at XXL', () => {
    // XXL: 60pt target, 36 gutters. 60pt needs 432, the row is 330.
    const size = fitFontSize(60, 402 - 72, WORDMARK_EM_WIDTH);
    expect(size).toBeLessThan(60);
    expect(size * WORDMARK_EM_WIDTH).toBeLessThanOrEqual(330);
  });
  it('steps down on a narrow phone at the default size too', () => {
    expect(fitFontSize(40, 320 - 48, WORDMARK_EM_WIDTH)).toBe(37);
  });
  it('falls back to the target on a width it cannot use', () => {
    expect(fitFontSize(40, 0, WORDMARK_EM_WIDTH)).toBe(40);
    expect(fitFontSize(40, NaN, WORDMARK_EM_WIDTH)).toBe(40);
  });
});
