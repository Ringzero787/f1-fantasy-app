import {
  MOONSHOT_COPY, FORBIDDEN_TERMS, callOpen, callSummary, callableMessage, chancePct, copyText, liveState, moonshotAvailability, moonshotColumn, multiplierLabel,
  outcomeLine, parseMoonshotConfig, predictionLabel, predictionSentence, quoteFresh, sameTerms, settledLine, signed, stakeOptions, statusLabel, toCall, usesForbiddenTerm, type MoonshotCall,
  activityLine, declarationLine, latestPositions, liveChip, raceWindow, sessionForRace,
} from '../../src/simple/grid/moonshot';
import { rankStandings } from '../../src/simple/grid/standings';
import { raceResultRows } from '../../src/simple/grid/raceLeaderboard';

const call = (over: Partial<MoonshotCall> = {}): MoonshotCall => ({
  id: 'm1', teamId: 'tA', raceId: 'austin_2026', roundNumber: 19, driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200,
  modelProbability: 0.11, rewardBand: 'MOONSHOT', multiplier: 5, potentialReward: 1000, ownsDriver: false, status: 'CONFIRMED', lockAtMs: 2_000, result: null, officialDriverFinish: null, adjustmentAmount: null, ...over,
});

describe('config and availability', () => {
  it('is off without a block, locked before the unlock round, open from it', () => {
    expect(moonshotAvailability(parseMoonshotConfig(undefined), 19)).toBe('off');
    const cfg = parseMoonshotConfig({ enabled: true, unlockRound: 13 });
    expect(moonshotAvailability(cfg, 12)).toBe('locked');
    expect(moonshotAvailability(cfg, 13)).toBe('open');
    expect(moonshotAvailability(cfg, null)).toBe('locked');
  });
  it('mirrors the server defaults and drops bad values', () => {
    const cfg = parseMoonshotConfig({ enabled: true, tokensPerTeam: 'three', pointsStakeLevels: [25, 50], predictionTypesEnabled: ['WIN', 'nonsense'], copy: { callTitle: 'TAKE THE SHOT', bad: 1 } });
    expect(cfg.tokensPerTeam).toBe(3);
    expect(cfg.pointsStakeLevels).toEqual([25, 50]);
    expect(cfg.predictionTypesEnabled).toEqual(['WIN']);
    expect(cfg.copy).toEqual({ callTitle: 'TAKE THE SHOT' });
    expect(copyText(cfg, 'callTitle')).toBe('TAKE THE SHOT');   // the server's words win
    expect(copyText(cfg, 'tokensLeft', { n: 2, s: 'S' })).toBe('YOU HAVE 2 MOONSHOTS');
    // an override that uses a forbidden word is ignored in favour of the default
    expect(copyText(parseMoonshotConfig({ copy: { callTitle: 'PLACE YOUR BET' } }), 'callTitle')).toBe('CALL A MOONSHOT');
  });
});

describe('the words', () => {
  it('no default copy uses a forbidden word', () => {
    for (const [key, text] of Object.entries(MOONSHOT_COPY)) expect({ key, term: usesForbiddenTerm(text) }).toEqual({ key, term: null });
  });
  it('the check catches the forbidden words whole, not inside other words', () => {
    expect(usesForbiddenTerm('Place your bet')).toBe('bet');
    expect(usesForbiddenTerm('The odds are long')).toBe('odds');
    expect(usesForbiddenTerm('Alphabet soup is better')).toBeNull();
    expect(FORBIDDEN_TERMS).toContain('sportsbook');
  });
  it('the formatted lines stay inside the vocabulary too', () => {
    const lines = [callSummary(call(), 'Hadjar'), settledLine(call({ result: 'HIT', officialDriverFinish: 3, adjustmentAmount: 1000, status: 'HIT' }), 'Hadjar'), outcomeLine(200, 1000), predictionSentence('TOP_5', 'Hadjar')];
    for (const l of lines) expect(usesForbiddenTerm(l)).toBeNull();
  });
});

describe('formatting', () => {
  it('labels, chances, multipliers and signed numbers', () => {
    expect(predictionLabel('TOP_5')).toBe('TOP 5');
    expect(predictionLabel('EXACT_FINISH', 7)).toBe('FINISH P7');
    expect(chancePct(0.1149)).toBe('11%');
    expect(multiplierLabel(5)).toBe('5×'); expect(multiplierLabel(1.25)).toBe('1.25×'); expect(multiplierLabel(0.5)).toBe('0.5×');
    expect(signed(1000)).toBe('+1,000'); expect(signed(-200)).toBe('−200'); expect(signed(0)).toBe('0');
    expect(outcomeLine(200, 1000)).toBe('HIT +1,000 · MISS −200');
  });
  it('the design’s summary line and the settled line', () => {
    expect(callSummary(call(), 'Hadjar')).toBe('HADJAR — PODIUM · 200 POINTS AT RISK · 5× · HIT +1,000 · MISS −200');
    expect(settledLine(call({ result: 'HIT', officialDriverFinish: 3, adjustmentAmount: 1000 }), 'Hadjar')).toBe('MOONSHOT HIT · HADJAR — PODIUM · Finished P3 · POINTS +1,000');
    expect(settledLine(call({ result: 'MISSED', officialDriverFinish: 4, adjustmentAmount: -200 }), 'Hadjar')).toBe('MOONSHOT MISSED · HADJAR — PODIUM · Finished P4 · POINTS −200');
    expect(settledLine(call({ result: 'VOID', adjustmentAmount: 0 }), 'Hadjar')).toBe('MOONSHOT VOID · TOKEN RETURNED · HADJAR — PODIUM · Not classified');
  });
  it('three stakes get the three labels; more get none', () => {
    expect(stakeOptions([50, 100, 200]).map((s) => s.label)).toEqual(['CAUTIOUS', 'BOLD', 'ALL-IN']);
    expect(stakeOptions([25, 50, 100, 200]).every((s) => s.label === '')).toBe(true);
  });
});

describe('time', () => {
  it('a quote is fresh until its expiry; a call is open until its lock', () => {
    expect(quoteFresh({ expiresAt: 2_000 }, 1_000)).toBe(true);
    expect(quoteFresh({ expiresAt: 2_000 }, 2_000)).toBe(false);
    expect(quoteFresh(null, 0)).toBe(false);
    expect(callOpen(call(), 1_000)).toBe(true);
    expect(callOpen(call(), 2_000)).toBe(false);
    expect(callOpen(call({ status: 'LOCKED' }), 1_000)).toBe(false);
    expect(callOpen(call({ lockAtMs: null }), 1_000)).toBe(true);   // no lock known: the server decides
  });
});

describe('race-day state', () => {
  it('IN inside the prediction, CLOSE one place outside, OUT beyond, PENDING without a position', () => {
    const podium = call();
    expect(liveState(podium, 3)).toBe('IN'); expect(liveState(podium, 4)).toBe('CLOSE'); expect(liveState(podium, 5)).toBe('OUT'); expect(liveState(podium, null)).toBe('PENDING');
    expect(liveState(call({ predictionType: 'WIN' }), 2)).toBe('CLOSE');
    expect(liveState(call({ predictionType: 'TOP_5' }), 6)).toBe('CLOSE');
    const exact = call({ predictionType: 'EXACT_FINISH', predictionTarget: 7 });
    expect(liveState(exact, 7)).toBe('IN'); expect(liveState(exact, 6)).toBe('CLOSE'); expect(liveState(exact, 9)).toBe('OUT');
  });
});

describe('the wire', () => {
  it('a moonshots document becomes a call whatever the date shape; missing numbers read as 0', () => {
    const base = { teamId: 'tA', raceId: 'r', driverId: 'hadjar', predictionType: 'WIN', stakeCurrency: 'POINTS', stakeAmount: 100, multiplier: 5, potentialReward: 500, status: 'CONFIRMED' };
    expect(toCall('m', { ...base, lockAt: { toMillis: () => 5_000 } }).lockAtMs).toBe(5_000);          // a Firestore Timestamp
    expect(toCall('m', { ...base, lockAt: { _seconds: 7, _nanoseconds: 0 } }).lockAtMs).toBe(7_000);  // through onCall's JSON
    expect(toCall('m', { ...base, lockAtMs: 9_000 }).lockAtMs).toBe(9_000);
    const c = toCall('m', { teamId: 'tA', predictionType: 'PODIUM', status: 'HIT', result: 'HIT', officialDriverFinish: 2, adjustmentAmount: 500 });
    expect([c.stakeAmount, c.modelProbability, c.lockAtMs, c.result, c.stakeCurrency, c.teamId]).toEqual([0, 0, null, 'HIT', 'POINTS', 'tA']);
    expect(toCall('m', { ...base, result: 'nonsense' }).result).toBeNull();
  });
  it('server refusals are shown as written; transport trouble gets a plain sentence', () => {
    expect(callableMessage({ code: 'functions/failed-precondition', message: 'Selections are locked for this race.' })).toBe('Selections are locked for this race.');
    expect(callableMessage({ code: 'functions/unavailable', message: 'INTERNAL' })).toBe('The server is not answering right now. Try again in a moment.');
    expect(callableMessage({ code: 'functions/internal', message: 'INTERNAL' })).toMatch(/not answering/);
    expect(callableMessage({ code: 'functions/unauthenticated' })).toMatch(/Sign in again/);
    expect(callableMessage(new Error(''))).toBe('Something went wrong. Try again.');
  });
  it('statuses read as the player\u2019s words, and a re-fetched quote with new numbers is not the same terms', () => {
    expect(statusLabel('CONFIRMED')).toBe('TAP TO VIEW'); expect(statusLabel('LOCKED')).toBe('LOCKED'); expect(statusLabel('VOID')).toBe('VOID');
    const q = { multiplier: 5, potentialReward: 500, rewardBand: 'MOONSHOT' };
    expect(sameTerms(q, { ...q })).toBe(true);
    expect(sameTerms(q, { ...q, multiplier: 2.5, potentialReward: 250 })).toBe(false);
  });
});

describe('standings column', () => {
  it('shows the Moonshot share in the season table only, and never a zero', () => {
    expect(moonshotColumn(500)).toBe('+500'); expect(moonshotColumn(-100)).toBe('−100'); expect(moonshotColumn(0)).toBeNull(); expect(moonshotColumn(undefined)).toBeNull();
    const members = [
      { userId: 'a', displayName: 'A', totalPoints: 1500, lastRacePoints: 100, moonshotPoints: 500 },
      { userId: 'b', displayName: 'B', totalPoints: 1400, lastRacePoints: 120 },
    ];
    expect(rankStandings(members, 'season', 'a').map((r) => [r.rank, r.moonshot])).toEqual([[1, '+500'], [2, null]]);
    expect(rankStandings(members, 'last', 'a').map((r) => r.moonshot)).toEqual([null, null]);
  });
  it('a race leaderboard carries the weekend’s Moonshot beside race points, ranked on race points', () => {
    const rows = raceResultRows({ raceId: 'r', entries: [{ userId: 'a', points: 187, rank: 2, racePoints: 187, moonshotPoints: 500, raceTotal: 687 }, { userId: 'b', points: 190, rank: 1 }], winners: ['b'] }, 'a');
    expect(rows.map((r) => [r.rank, r.shown, r.moonshot, r.isLeader])).toEqual([[2, '+187', '+500', false], [1, '+190', null, true]]);
  });
});

describe('the league and the race weekend', () => {
  it('the declaration and the history lines read as the design wrote them, in the vocabulary', () => {
    const d = declarationLine(call(), 'Hadjar', 'Nathan');
    expect(d).toBe('🚀 NATHAN CALLED A MOONSHOT · HADJAR — PODIUM · 200 POINTS AT RISK · MODEL CHANCE 11% · REWARD 5× · HIT +1,000');
    const hit = activityLine({ id: 'a', type: 'MOONSHOT_HIT', userId: 'u', driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, officialDriverFinish: 3, stakeCurrency: 'POINTS', stakeAmount: 200, multiplier: 5, modelProbability: 0.11, adjustmentAmount: 1000, raceId: 'r', roundNumber: 19, createdAtMs: null }, 'Hadjar', 'Nathan');
    expect(hit).toBe('🔥 MOONSHOT HIT · Nathan called Hadjar Podium. Hadjar finished P3. +1,000 Points');
    const miss = activityLine({ id: 'b', type: 'MOONSHOT_MISSED', userId: 'u', driverId: 'norris', predictionType: 'WIN', predictionTarget: null, officialDriverFinish: 2, stakeCurrency: 'POINTS', stakeAmount: 100, multiplier: 2.5, modelProbability: 0.22, adjustmentAmount: -100, raceId: 'r', roundNumber: 19, createdAtMs: null }, 'Norris', 'Mike');
    expect(miss).toBe('💥 MOONSHOT MISSED · Mike called Norris Win. Norris finished P2. \u2212100 Points');
    const voided = activityLine({ id: 'c', type: 'MOONSHOT_VOID', userId: 'u', driverId: 'norris', predictionType: 'TOP_5', predictionTarget: null, officialDriverFinish: null, stakeCurrency: 'CASH', stakeAmount: 50, multiplier: 0.5, modelProbability: 0.8, adjustmentAmount: 0, raceId: 'r', roundNumber: 19, createdAtMs: null }, 'Norris', 'Sam');
    expect(voided).toBe('↩ MOONSHOT VOID · TOKEN RETURNED · Sam called Norris Top 5. Norris was not classified.');
    for (const l of [d, hit, miss, voided]) expect(usesForbiddenTerm(l)).toBeNull();
  });
  it('the race window opens at the start and closes three hours after, or on completion', () => {
    const start = Date.UTC(2026, 9, 11, 12, 0, 0);
    const race = { status: 'upcoming', schedule: { race: new Date(start) } };
    expect(raceWindow(race, start - 1)).toBe('before');
    expect(raceWindow(race, start)).toBe('live');
    expect(raceWindow(race, start + 3 * 60 * 60 * 1000)).toBe('live');
    expect(raceWindow(race, start + 3 * 60 * 60 * 1000 + 1)).toBe('after');
    expect(raceWindow({ ...race, status: 'in_progress' }, start - 1)).toBe('live');     // the server says it is on
    expect(raceWindow({ ...race, status: 'completed' }, start + 1)).toBe('after');
    expect(raceWindow(null, start)).toBe('before');
  });
  it('the latest position per car wins; the race session is the one on the race day', () => {
    const rows = [
      { driver_number: 6, position: 5, date: '2026-10-11T12:05:00Z' }, { driver_number: 6, position: 4, date: '2026-10-11T12:40:00Z' }, { driver_number: 6, position: 6, date: '2026-10-11T12:20:00Z' },
      { driver_number: 1, position: 1, date: '2026-10-11T12:40:00Z' },
    ];
    expect([...latestPositions(rows)]).toEqual([[6, 4], [1, 1]]);
    const sessions = [{ session_key: 1, session_name: 'Race', date_start: '2026-10-04T13:00:00+00:00' }, { session_key: 2, session_name: 'Race', date_start: '2026-10-11T12:00:00+00:00' }];
    expect(sessionForRace(sessions, new Date(Date.UTC(2026, 9, 11, 12)))?.session_key).toBe(2);
    expect(sessionForRace(sessions, null)).toBeNull();
    expect(liveChip('CLOSE')).toBe('ONE POSITION AWAY'); expect(liveChip('PENDING')).toBe('PENDING');
  });
});
