/**
 * F-157: season-shaped defaults come from the server. The round count and sprint rounds are read off
 * the current season's race documents unless config/gameRules sets them; car numbers come from the
 * live driver documents, with the bundled table only as the fallback.
 */
jest.mock('../../src/config/firebase', () => ({ db: {}, firebaseAuth: { currentUser: null } }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn(), collection: jest.fn(), getDocs: jest.fn(), orderBy: jest.fn(), query: jest.fn() }));
jest.mock('../../src/services/race.service', () => ({ raceService: { parseScheduleDates: (s: unknown) => s } }));

import { withSeasonShape, remoteConfigService } from '../../src/services/remoteConfig.service';
import { driverIdForNumber } from '../../src/services/openf1.service';
import type { Race } from '../../src/types';

const race = (seasonId: string, round: number, iso: string, hasSprint = false, status = 'upcoming') =>
  ({ id: `r${seasonId}_${round}`, seasonId, round, hasSprint, status, schedule: { race: new Date(iso) } }) as unknown as Race;
const CAL = [
  race('2026', 25, '2026-12-06T13:00:00Z', false, 'completed'),
  race('2026', 19, '2026-10-04T12:00:00Z', true, 'completed'),
  race('2027', 1, '2027-03-14T05:00:00Z'),
  race('2027', 2, '2027-03-21T07:00:00Z', true),
  race('2027', 5, '2027-04-25T07:00:00Z', true),
];

describe('withSeasonShape', () => {
  const defaults = remoteConfigService.getDefaults();

  it('bundles no round count or sprint list', () => {
    expect(defaults.totalRounds).toBe(0);
    expect(defaults.sprintRounds).toEqual([]);
  });

  it("fills them from the current season's races", () => {
    const after = withSeasonShape(defaults, CAL, { currentSeason: '2027' }, Date.parse('2027-01-10T00:00:00Z'));
    expect(after.totalRounds).toBe(5);
    expect(after.sprintRounds).toEqual([2, 5]);
    const before = withSeasonShape(defaults, CAL, { currentSeason: null }, Date.parse('2027-01-10T00:00:00Z'));
    expect(before.totalRounds).toBe(25);
    expect(before.sprintRounds).toEqual([19]);
  });

  it('a config/gameRules value wins', () => {
    const cfg = { ...defaults, totalRounds: 24, sprintRounds: [3, 9] };
    expect(withSeasonShape(cfg, CAL, { currentSeason: '2027' })).toBe(cfg);
  });
});

describe('driverIdForNumber', () => {
  const d = (id: string, number: number, isActive = true) => ({ id, number, isActive });
  it('the active driver document with that number wins over the bundled table', () => {
    expect(driverIdForNumber(31, [d('newcomer', 31), d('ocon', 31, false)])).toBe('newcomer');
    expect(driverIdForNumber(99, [d('rookie', 99)])).toBe('rookie');
  });
  it('falls back to the table with no documents, or a number two active drivers share', () => {
    expect(driverIdForNumber(44, [])).toBe('hamilton');
    expect(driverIdForNumber(51, [d('camara', 51), d('other', 51)])).toBe('camara');
    expect(driverIdForNumber(99, [])).toBeNull();
  });
});
