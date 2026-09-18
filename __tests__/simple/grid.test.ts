import { formatCountdown, formatLockStatus, formatRoundStatus, seasonProgress } from '../../src/simple/grid/lockStatus';
import { contractDots } from '../../src/simple/grid/contractDots';
import { computeTiles, lineupStatus, openSlotCount, rosterRacePoints, tileNameSize, trendOf } from '../../src/simple/grid/tileState';
import type { FantasyTeam } from '../../src/types';

const H = 60 * 60 * 1000;
const now = new Date('2026-09-18T12:00:00Z');

describe('lock status', () => {
  it('counts down in days and hours before the lock', () => {
    expect(formatLockStatus({
      isLocked: false, lockTime: new Date(now.getTime() + 2 * 24 * H + 14 * H + 20 * 60000),
      qualifyingTime: null, raceStartTime: null, hasNextRace: true, now,
    })).toBe('LOCKS IN 2D 14H');
  });
  it('drops to minutes inside the last hour', () => {
    expect(formatCountdown(45 * 60000)).toBe('45M');
    expect(formatCountdown(3 * H + 5 * 60000)).toBe('3H');
    expect(formatCountdown(0)).toBe('NOW');
  });
  it('shows quali, then race, then racing once locked', () => {
    const base = { isLocked: true, lockTime: new Date(now.getTime() - H), hasNextRace: true, now };
    expect(formatLockStatus({ ...base, qualifyingTime: new Date(now.getTime() + 9 * H), raceStartTime: new Date(now.getTime() + 30 * H) })).toBe('LOCKED · QUALI IN 9H');
    expect(formatLockStatus({ ...base, qualifyingTime: new Date(now.getTime() - H), raceStartTime: new Date(now.getTime() + 2 * H) })).toBe('LOCKED · RACE IN 2H');
    expect(formatLockStatus({ ...base, qualifyingTime: new Date(now.getTime() - H), raceStartTime: new Date(now.getTime() - H) })).toBe('LOCKED · RACING');
  });
  it('reports the season over with no next race', () => {
    expect(formatLockStatus({ isLocked: true, lockTime: null, qualifyingTime: null, raceStartTime: null, hasNextRace: false, now })).toBe('SEASON OVER');
  });
  it('formats the round line and progress', () => {
    expect(formatRoundStatus(17, 24, 'Baku')).toBe('RD 17 / 24 · BAKU');
    expect(formatRoundStatus(17, 24, '')).toBe('RD 17 / 24');
    expect(seasonProgress(16, 24)).toBeCloseTo(0.6667, 3);
    expect(seasonProgress(30, 24)).toBe(1);
  });
});

describe('contract dots', () => {
  it('fills the races left and hollows the used ones', () => {
    expect(contractDots(4, 1)).toEqual({ length: 4, left: 3, critical: false, dots: ['on', 'on', 'on', 'off'] });
  });
  it('turns red with one race left', () => {
    expect(contractDots(3, 2)).toEqual({ length: 3, left: 1, critical: true, dots: ['last', 'off', 'off'] });
  });
  it('falls back to the default contract and clamps', () => {
    expect(contractDots(undefined, undefined, 3).dots).toEqual(['on', 'on', 'on']);
    expect(contractDots(2, 5).left).toBe(0);
  });
});

describe('tiles', () => {
  const team = {
    id: 't1', userId: 'u1', leagueId: null, name: 'Apex', budget: 100, totalSpent: 900, totalPoints: 1284,
    isLocked: false, aceDriverId: 'fiorini',
    drivers: [
      { driverId: 'varga', name: 'Rafael Varga', shortName: 'VAR', constructorId: 'apex', purchasePrice: 400, currentPrice: 420, pointsScored: 312, racesHeld: 0, contractLength: 4 },
      { driverId: 'kowalczyk', name: 'Tomasz Kowalczyk', shortName: 'KOW', constructorId: 'cobalt_racing', purchasePrice: 400, currentPrice: 420, pointsScored: 251, racesHeld: 2, contractLength: 3 },
      { driverId: 'bakkerud', name: 'Sander Bakkerud', shortName: 'BAK', constructorId: 'silverline', purchasePrice: 100, currentPrice: 90, pointsScored: 62, racesHeld: 0, contractLength: 3, isReservePick: true },
      { driverId: 'fiorini', name: 'Mateo Fiorini', shortName: 'FIO', constructorId: 'scarlet_gp', purchasePrice: 300, currentPrice: 300, pointsScored: 224, racesHeld: 1, contractLength: 4 },
    ],
    constructor: { constructorId: 'apex', name: 'Apex Motorsport', purchasePrice: 200, currentPrice: 210, pointsScored: 610, racesHeld: 1, contractLength: 4 },
  } as unknown as FantasyTeam;
  const ctx = {
    teamSize: 5, defaultContract: 3, showCarNumbers: true,
    lastRace: { varga: 25, kowalczyk: 12, bakkerud: 0, fiorini: 15, apex: 43 },
    prevRace: { varga: 18, kowalczyk: 15, bakkerud: 6, fiorini: 12, apex: 43 },
    numbers: { varga: 4, kowalczyk: 1, bakkerud: 12, fiorini: 16 },
    constructorNames: { apex: 'Apex' },
  };

  it('lays out drivers, open slots, then the constructor', () => {
    const tiles = computeTiles(team, ctx);
    expect(tiles.map((t) => t.kind)).toEqual(['driver', 'driver', 'driver', 'driver', 'empty', 'constructor']);
    expect(openSlotCount(tiles)).toBe(1);
    expect(lineupStatus(1, false)).toEqual({ text: '1 OPEN', accent: true });
    expect(lineupStatus(0, false)).toEqual({ text: 'SET', accent: false });
    expect(lineupStatus(1, true)).toEqual({ text: 'LOCKED', accent: false });
  });
  it('derives number, name size, auto, ace, dots and trend per tile', () => {
    const [varga, ver, ant, lec, , mcl] = computeTiles(team, ctx);
    expect(varga).toMatchObject({ name: 'Varga', nameSize: 19, tag: '04', trend: { glyph: '▲', last: 25 }, dots: { left: 4 } });
    expect(ver).toMatchObject({ name: 'Kowalczyk', nameSize: 15, tag: '01', trend: { glyph: '▼' }, dots: { left: 1, critical: true } });
    expect(ant).toMatchObject({ name: 'Bakkerud', nameSize: 15, auto: true, trend: { glyph: '▼', last: 0 } });
    expect(lec).toMatchObject({ ace: true, dots: { left: 3 } });
    expect(mcl).toMatchObject({ kind: 'constructor', name: 'Apex', trend: { glyph: '•', last: 43 } });
  });
  it('hides car numbers when asked and reads flat with no history', () => {
    const [varga] = computeTiles(team, { ...ctx, showCarNumbers: false, prevRace: {} });
    expect(varga).toMatchObject({ tag: '', trend: { glyph: '•', last: 25 } });
    expect(trendOf(null, 5).last).toBeNull();
    expect(tileNameSize('Marchetti')).toBe(19);
    expect(tileNameSize('Castellano')).toBe(17);
  });
  it('sums roster points for the last race', () => {
    expect(rosterRacePoints(team, ctx.lastRace)).toBe(25 + 12 + 0 + 15 + 43);
    expect(rosterRacePoints(team, {})).toBeNull();
  });
  it('reads SET with no open slots for a full lineup', () => {
    const full = { ...team, drivers: [...team.drivers, { driverId: 'marchetti', name: 'Eli Marchetti', shortName: 'MAR', constructorId: 'apex', purchasePrice: 300, currentPrice: 300, pointsScored: 298, racesHeld: 0, contractLength: 3 }] } as unknown as FantasyTeam;
    const tiles = computeTiles(full, ctx);
    expect(tiles).toHaveLength(6);
    expect(openSlotCount(tiles)).toBe(0);
    expect(lineupStatus(openSlotCount(tiles), false)).toEqual({ text: 'SET', accent: false });
  });
  it('shows six open slots for a fresh team', () => {
    const fresh = { ...team, drivers: [], constructor: null } as unknown as FantasyTeam;
    expect(openSlotCount(computeTiles(fresh, ctx))).toBe(6);
  });
});
