import { describe, expect, it } from 'vitest';
import { offSeason, offSeasonText, openerLine } from './offseason';

describe('F-155 off-season state', () => {
  it('starts when the server season passes the portal season, and not before', () => {
    expect(offSeason('2027', '2026')).toEqual({ ended: '2026', next: '2027', opener: null });
    expect(offSeason('2026', '2026')).toBeNull();
    expect(offSeason('2025', '2026')).toBeNull();
  });
  it('absent or junk is not off-season (the round on screen stays)', () => {
    for (const v of [undefined, null, 2027, '', '27', '2027a']) expect(offSeason(v, '2026')).toBeNull();
  });
  it('names the opener and its date', () => {
    const o = offSeason('2027', '2026', { name: 'Australian Grand Prix', raceMs: Date.parse('2027-03-14T04:00:00Z') })!;
    expect(openerLine(o)).toBe('Australian Grand Prix on 14 March 2027');
    expect(openerLine({ ...o, opener: { name: 'Australia', raceMs: null } })).toBe('Australia');
    expect(openerLine({ ...o, opener: null })).toBe('the 2027 season');
    const t = offSeasonText(o);
    expect(t.title).toBe('The 2026 season is over');
    expect(t.body).toMatch(/started fresh for 2027/);
  });
});
