import { describe, expect, it } from 'vitest';
import { PAGES, pageFor, pathFor } from './router';

/**
 * The tab strip scrolls horizontally on a phone, so a page past about the fourth tab is off the
 * edge and may as well not exist. That makes the order a product decision, and this pins the part
 * of it that was wrong: LINEUP LAB answers "what do I change to score more", which is the thing
 * somebody has just paid for, and it was sixth.
 */
describe('tab order', () => {
  it('puts the lineup lab within reach without scrolling the tabs', () => {
    expect(PAGES[0]).toBe('BRIEFING');
    expect(PAGES[1]).toBe('LINEUP LAB');
  });

  it('still routes every page to its own path', () => {
    expect(pathFor('BRIEFING')).toBe('/');
    for (const p of PAGES) expect(pageFor(pathFor(p))).toBe(p);
  });

  it('keeps the paths stable, because they are links people already hold', () => {
    expect(pathFor('LINEUP LAB')).toBe('/lineup-lab');
    expect(pathFor('PACE LAB')).toBe('/pace-lab');
    expect(pathFor('WIRE')).toBe('/wire');
  });

  it('falls back to the briefing for anything unrecognised', () => {
    expect(pageFor('/nonsense')).toBe('BRIEFING');
    expect(pageFor('/')).toBe('BRIEFING');
    expect(pageFor('/lineup-lab/')).toBe('LINEUP LAB');
  });
});
