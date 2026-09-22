import { describe, expect, it } from 'vitest';
import { countdown, lockTime } from './lock';
import { pageFor, pathFor, isHandoffPath, PAGES } from './router';

describe('lock countdown', () => {
  const fp3 = new Date('2026-09-26T08:30:00Z'), sq = new Date('2026-09-25T12:30:00Z'), q = new Date('2026-09-26T12:00:00Z');
  it('locks at FP3, or at sprint qualifying on a sprint weekend, falling back to qualifying', () => {
    expect(lockTime({ fp3, qualifying: q }, false)).toBe(fp3);
    expect(lockTime({ fp3, sprintQualifying: sq, qualifying: q }, true)).toBe(sq);
    expect(lockTime({ qualifying: q }, false)).toBe(q);
    expect(lockTime({}, false)).toBeNull();
  });
  it('formats days and hours, then hours and minutes, then LOCKED', () => {
    expect(countdown(new Date('2026-09-20T04:30:00Z'), fp3)).toBe('6d 04h');
    expect(countdown(new Date('2026-09-26T05:18:00Z'), fp3)).toBe('3h 12m');
    expect(countdown(new Date('2026-09-26T08:30:00Z'), fp3)).toBe('LOCKED');
    expect(countdown(new Date(), null)).toBe('—');
  });
});

describe('routes', () => {
  it('round-trips every page and keeps the handoff path separate', () => {
    for (const p of PAGES) expect(pageFor(pathFor(p))).toBe(p);
    expect(pathFor('LINEUP LAB')).toBe('/lineup-lab');
    expect(pageFor('/nope')).toBe('BRIEFING');
    expect(pageFor('/board/')).toBe('BOARD');
    expect(isHandoffPath('/h')).toBe(true);
    expect(isHandoffPath('/h/')).toBe(true);
    expect(isHandoffPath('/help')).toBe(false);
  });
});

import { parseHandoffFragment } from './handoff';
describe('handoff fragment', () => {
  it('accepts only a well-formed code and a short source tag', () => {
    const code = 'A'.repeat(43);
    expect(parseHandoffFragment(`#${code}&src=profile`)).toEqual({ code, src: 'profile' });
    expect(parseHandoffFragment(`#${code}`)).toEqual({ code, src: null });
    expect(parseHandoffFragment('#short&src=profile').code).toBeNull();
    expect(parseHandoffFragment(`#${code}&src=<script>`).src).toBeNull();
    expect(parseHandoffFragment('')).toEqual({ code: null, src: null });
  });
});
