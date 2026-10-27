// F-130: the weekend recap from the round record — what the card says, from the documents the server writes.
import fs from 'fs';
import path from 'path';
import {
  FALLBACK_NOTE, LINEUP_SIZE, adjustmentLine, fieldedLine, nextRoundLines, recapStanding, recapTitle, rosterFromSnapshot, rosterFromTeam, roundLine, seasonLine, splitZeroPicks, toRaceSnapshot, zeroLine,
} from '../../src/simple/grid/weekendRecap';
import { parseMoonshotConfig, usesForbiddenTerm, type MoonshotCall } from '../../src/simple/grid/moonshot';

const names = {
  driver: (id: string) => ({ verstappen: 'Verstappen', hadjar: 'Hadjar', gasly: 'Gasly', sainz: 'Sainz', lawson: 'Lawson' }[id] ?? id),
  constructor: (id: string) => ({ red_bull: 'Red Bull' }[id] ?? id),
};

const stored = {
  teamId: 't1', userId: 'u1', leagueId: 'L1', raceId: 'usa_2026', season: '2026', round: 20,
  roster: {
    drivers: [
      { driverId: 'verstappen', constructorId: 'red_bull', purchasePrice: 180, currentPrice: 190, contractLength: 5, racesHeld: 3, isReservePick: false },
      { driverId: 'hadjar', constructorId: 'rb', purchasePrice: 60, currentPrice: 62, contractLength: 5, racesHeld: 0, isReservePick: true },
      { driverId: 'gasly', constructorId: 'alpine', purchasePrice: 50, currentPrice: 48, contractLength: 5, racesHeld: 1, isReservePick: false },
    ],
    constructor: { constructorId: 'red_bull', purchasePrice: 150, currentPrice: 155, contractLength: 5, racesHeld: 3, isReservePick: false },
    aceDriverId: 'verstappen', aceConstructorId: null, budget: 40,
  },
  phases: {
    qualifying: { points: 6, entities: { verstappen: 4, gasly: 1, red_bull: 1 }, scoredAt: 1 },
    race: { points: 70, entities: { verstappen: 56, hadjar: 0, gasly: -3, red_bull: 27 }, adjustment: -10, scoredAt: 2 },
  },
};

describe('toRaceSnapshot', () => {
  it('reads the stored document, phase by phase', () => {
    const s = toRaceSnapshot(stored)!;
    expect(s.raceId).toBe('usa_2026');
    expect(s.round).toBe(20);
    expect(s.drivers.map((d) => d.id)).toEqual(['verstappen', 'hadjar', 'gasly']);
    expect(s.drivers[1].isReservePick).toBe(true);
    expect(s.constructor).toEqual({ id: 'red_bull', racesHeld: 3, isReservePick: false });
    expect(s.aceDriverId).toBe('verstappen');
    expect(s.phases.race?.adjustment).toBe(-10);
    expect(s.phases.sprint).toBeUndefined();
  });
  it('is null for nothing, and tolerant of a bare roster', () => {
    expect(toRaceSnapshot(undefined)).toBeNull();
    expect(toRaceSnapshot({})).toBeNull();
    const s = toRaceSnapshot({ raceId: 'x', roster: {}, phases: { race: { points: 'no', entities: { a: 'b', c: 2 } } } })!;
    expect(s.drivers).toEqual([]);
    expect(s.constructor).toBeNull();
    expect(s.phases.race).toEqual({ points: 0, entities: { c: 2 }, adjustment: 0 });
  });
});

describe('rosterFromSnapshot', () => {
  const r = rosterFromSnapshot(toRaceSnapshot(stored)!, names);
  it('credits the weekend as scored: every phase, the penalty, and the Ace as doubled by the server', () => {
    expect(r.total).toBe(76);
    expect(r.adjustment).toBe(-10);
    expect(r.fromRecord).toBe(true);
    expect(r.picks.map((p) => [p.name, p.points])).toEqual([['Verstappen', 60], ['Red Bull', 28], ['Hadjar', 0], ['Gasly', -2]]);
    expect(r.picks[0].isAce).toBe(true);
    expect(r.picks[1].isConstructor).toBe(true);
    expect(r.picks[2].isReserve).toBe(true);
  });
  it('counts what was fielded and what was not', () => {
    expect(r.fielded).toBe(4);
    expect(r.open).toBe(2);
    expect(fieldedLine(r)).toBe('FIELDED 4 OF 6 · 2 OPEN SLOTS SCORED NOTHING');
    expect(adjustmentLine(r)).toBe('STALE ROSTER PENALTY −10');
  });
  it('a one-driver weekend reads as one driver and five empty slots', () => {
    const one = rosterFromSnapshot(toRaceSnapshot({ raceId: 'usa_2026', roster: { drivers: [stored.roster.drivers[0]], constructor: null, aceDriverId: null }, phases: { race: { points: 57, entities: { verstappen: 57 } } } })!, names);
    expect(one.total).toBe(57);
    expect(one.picks).toHaveLength(1);
    expect(one.open).toBe(5);
    expect(fieldedLine(one)).toBe('FIELDED 1 OF 6 · 5 OPEN SLOTS SCORED NOTHING');
    expect(adjustmentLine(one)).toBeNull();
    expect(LINEUP_SIZE).toBe(6);
  });
});

describe('rosterFromTeam (the fallback)', () => {
  it('scores the roster as it is now and says it is not the record', () => {
    const r = rosterFromTeam({ drivers: [{ driverId: 'lawson', shortName: 'LAW' }, { driverId: 'sainz', name: 'Carlos Sainz' }], aceDriverId: 'sainz' }, { constructorId: 'red_bull', name: 'Red Bull Racing' }, { lawson: { totalPoints: 12 }, red_bull: { totalPoints: 30 } });
    expect(r.fromRecord).toBe(false);
    expect(r.total).toBe(42);
    expect(r.picks.map((p) => [p.name, p.points, p.isAce])).toEqual([['Red', 30, false], ['LAW', 12, false], ['Carlos Sainz', 0, true]]);
    expect(r.open).toBe(3);
    expect(FALLBACK_NOTE).toContain('NO RECORD');
  });
});

describe('the zero line', () => {
  const r = rosterFromSnapshot(toRaceSnapshot(stored)!, names);
  it('folds the picks that scored nothing into one line', () => {
    const { scored, zeros } = splitZeroPicks(r.picks);
    expect(scored.map((p) => p.name)).toEqual(['Verstappen', 'Red Bull', 'Gasly']);
    expect(zeroLine(zeros)).toBe('1 PICK SCORED 0 · HADJAR');
    expect(zeroLine([])).toBeNull();
    expect(zeroLine([...zeros, { ...zeros[0], id: 'x', name: 'Sainz' }])).toBe('2 PICKS SCORED 0 · HADJAR, SAINZ');
  });
});

const result = {
  raceId: 'usa_2026', round: 20, topPoints: 112, winners: ['u9'],
  entries: [
    { userId: 'u9', points: 112, rank: 1 },
    { userId: 'u2', points: 80, rank: 2 },
    { userId: 'u1', points: 57, rank: 3 },
    { userId: 'u3', points: 57, rank: 3 },
    { userId: 'u4', points: -5, rank: 5 },
  ],
};
const members = [
  { userId: 'u9', leagueId: 'L1', rank: 1, previousRank: 2 },
  { userId: 'u1', leagueId: 'L1', rank: 2, previousRank: 3 },
  { userId: 'u2', leagueId: 'L1', rank: 3, previousRank: 1 },
  { userId: 'zz', leagueId: 'L2', rank: 1 },
];

describe('recapStanding and its lines', () => {
  it('the round from the leaderboard, the season from the member list', () => {
    const s = recapStanding(result as never, 'u1', members, 'L1');
    expect(s).toEqual({ roundRank: 3, roundOf: 5, topPoints: 112, roundPoints: 57, wonRound: false, seasonRank: 2, seasonOf: 3, seasonMove: 1 });
    expect(roundLine(s)).toBe('ROUND P3 / 5 · LEADER +112 · 55 BEHIND');
    expect(seasonLine(s, 3333)).toBe('SEASON P2 / 3 · ▲ 1 · 3,333 PTS');
  });
  it('the winner is told so, a drop reads down, no movement reads plain', () => {
    expect(roundLine(recapStanding(result as never, 'u9', members, 'L1'))).toBe('ROUND WINNER · +112');
    expect(seasonLine(recapStanding(result as never, 'u2', members, 'L1'), 100)).toBe('SEASON P3 / 3 · ▼ 2 · 100 PTS');
    expect(seasonLine(recapStanding(null, 'zz', members, 'L2'), null)).toBe('SEASON P1 / 1');
  });
  it('outside a league, or before the leaderboard exists, there is nothing to say', () => {
    const none = recapStanding(null, 'u1', [], null);
    expect(roundLine(none)).toBeNull();
    expect(seasonLine(none, 10)).toBeNull();
    expect(roundLine(recapStanding({ ...result, entries: [] } as never, 'u1', members, 'L1'))).toBeNull();
  });
  it('a round nobody won has no leader to chase', () => {
    expect(roundLine(recapStanding({ ...result, topPoints: 0, winners: [], entries: [{ userId: 'u1', points: 0, rank: 1 }] } as never, 'u1', [], 'L1'))).toBe('ROUND P1 / 1');
  });
});

const call = (over: Partial<MoonshotCall> = {}): MoonshotCall => ({
  id: 'm1', teamId: 't1', raceId: 'mexico_2026', roundNumber: 21, driverId: 'verstappen', predictionType: 'WIN', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200,
  modelProbability: 0.3, rewardBand: 'LONGSHOT', multiplier: 2.5, potentialReward: 500, ownsDriver: false, status: 'CONFIRMED', lockAtMs: 5_000, result: null, officialDriverFinish: null, adjustmentAmount: null, ...over,
});
const cfg = parseMoonshotConfig({ enabled: true, unlockRound: 13, tokensPerTeam: 3 });
const mexico = { id: 'mexico_2026', round: 21, name: 'Mexico City Grand Prix', city: 'Mexico City' };

describe('nextRoundLines', () => {
  it('names the next round, its lock, and the Moonshot in play on it', () => {
    const n = nextRoundLines(mexico, new Date(4 * 86_400_000 + 4 * 3_600_000 + 1000), false, 0, [call()], 't1', cfg, names.driver)!;
    expect(n.label).toBe('NEXT · RD 21 · MEXICO CITY');
    expect(n.lock).toBe('LOCKS IN 4D 4H');
    expect(n.moonshot).toBe('🚀 MOONSHOT IN PLAY · VERSTAPPEN — WIN');
  });
  it('a locked call, no call, and no tokens', () => {
    expect(nextRoundLines(mexico, null, true, 10_000, [call()], 't1', cfg, names.driver)!.moonshot).toBe('🚀 MOONSHOT LOCKED · VERSTAPPEN — WIN');
    expect(nextRoundLines(mexico, null, true, 10_000, [call()], 't1', cfg, names.driver)!.lock).toBe('LOCKED');
    expect(nextRoundLines(mexico, null, false, 0, [], 't1', cfg, names.driver)!.moonshot).toBe('🚀 NO MOONSHOT CALLED YET · 3 LEFT');
    const spent = [call({ id: 'a', raceId: 'r1', status: 'MISSED', result: 'MISSED' }), call({ id: 'b', raceId: 'r2', status: 'HIT', result: 'HIT' }), call({ id: 'c', raceId: 'r3', status: 'MISSED', result: 'MISSED' })];
    expect(nextRoundLines(mexico, null, false, 0, spent, 't1', cfg, names.driver)!.moonshot).toBe('🚀 NO MOONSHOTS LEFT THIS SEASON');
  });
  it('the other team’s call and a cancelled call are not this team’s', () => {
    expect(nextRoundLines(mexico, null, false, 0, [call({ teamId: 't2' })], 't1', cfg, names.driver)!.moonshot).toBe('🚀 NO MOONSHOT CALLED YET · 3 LEFT');
    expect(nextRoundLines(mexico, null, false, 0, [call({ status: 'CANCELLED' })], 't1', cfg, names.driver)!.moonshot).toBe('🚀 NO MOONSHOT CALLED YET · 3 LEFT');
  });
  it('says nothing about Moonshot before it unlocks or when it is off, and nothing at all after the season', () => {
    expect(nextRoundLines({ ...mexico, round: 5 }, null, false, 0, [], 't1', cfg, names.driver)!.moonshot).toBeNull();
    expect(nextRoundLines(mexico, null, false, 0, [], 't1', parseMoonshotConfig({ enabled: false }), names.driver)!.moonshot).toBeNull();
    expect(nextRoundLines(null, null, false, 0, [], 't1', cfg, names.driver)).toBeNull();
  });
  it('falls back to the race name when there is no city', () => {
    expect(nextRoundLines({ id: 'x', round: 22, name: 'São Paulo Grand Prix' }, null, false, 0, [], null, cfg, names.driver)!.label).toBe('NEXT · RD 22 · SÃO PAULO');
  });
});

describe('vocabulary', () => {
  it('the title drops the series’ own words, and nothing the card says uses a forbidden term', () => {
    expect(recapTitle('United States Grand Prix')).toBe('United States');
    const r = rosterFromSnapshot(toRaceSnapshot(stored)!, names);
    const s = recapStanding(result as never, 'u1', members, 'L1');
    const n = nextRoundLines(mexico, null, false, 0, [call()], 't1', cfg, names.driver)!;
    for (const text of [fieldedLine(r), adjustmentLine(r), zeroLine(splitZeroPicks(r.picks).zeros), roundLine(s), seasonLine(s, 1), n.label, n.lock, n.moonshot, FALLBACK_NOTE]) {
      if (text) expect(usesForbiddenTerm(text)).toBeNull();
    }
  });
});

/** The hook reads the record only when a recap is due, waits for it, and never in demo mode (pinned as shapes, like F-127). */
describe('the recap hook’s record wiring', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src/simple/hooks/useWeekendRecap.ts'), 'utf8');
  it('reads the snapshot and the leaderboard once per team and race, outside demo mode', () => {
    expect(src).toContain("const recordKey = recapDue && teamId && lastRaceId && !isDemoMode ? `${teamId}:${lastRaceId}:${leagueId ?? '-'}` : null;");
    expect(src).toContain('getRaceSnapshot(teamId, lastRaceId).catch(() => null),');
    expect(src).toContain('leagueId ? readLeagueRaceResult(leagueId, lastRaceId) : Promise.resolve(null),');
  });
  it('holds the recap until the record has answered, then falls back to the roster when there is none', () => {
    expect(src).toContain('const recordReady = !recordKey || record?.key === recordKey;');
    expect(src).toContain('if (!recordReady) return null;');
    expect(src).toContain('const roster = snapshot ? rosterFromSnapshot(snapshot, names) : rosterFromTeam(team, teamConstructor, lastRaceScores);');
  });
  it('the screen ends with the next round and marks the Ace, the constructor and the auto-filled picks', () => {
    const screen = fs.readFileSync(path.join(__dirname, '..', '..', 'src/simple/grid/GridWeekendRecap.tsx'), 'utf8');
    expect(screen).toContain("p.isConstructor ? 'TEAM' : null, p.isAce ? 'ACE ×2' : null, p.isReserve ? 'AUTO' : null");
    expect(screen).toMatch(/\{shot\?\.total[^]*?F-130: the card ends looking forward[^]*?LEAGUE SCORES/);
  });
});
