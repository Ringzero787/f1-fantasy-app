import {
  MOONSHOT_COPY, FORBIDDEN_TERMS, callOpen, callSummary, chancePct, copyText, liveState, moonshotAvailability, moonshotColumn, multiplierLabel,
  outcomeLine, parseMoonshotConfig, predictionLabel, predictionSentence, quoteFresh, settledLine, signed, stakeOptions, usesForbiddenTerm, type MoonshotCall,
} from '../../src/simple/grid/moonshot';
import { rankStandings } from '../../src/simple/grid/standings';
import { raceResultRows } from '../../src/simple/grid/raceLeaderboard';

const call = (over: Partial<MoonshotCall> = {}): MoonshotCall => ({
  id: 'm1', raceId: 'austin_2026', roundNumber: 19, driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200,
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
