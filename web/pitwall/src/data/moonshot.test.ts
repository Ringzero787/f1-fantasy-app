import { describe, expect, it } from 'vitest';
import {
  callOpen, callSummary, chancePct, coveredPositions, declarationLine, distributionBars, moonshotErrorText, multiplierLabel, outcomeLine,
  liveChip, liveState, predictionLabel, quoteFresh, sameTerms, settledLine, signed, stakeOptions, statsLines, toCall, toLiveDoc, usesForbiddenTerm, type BoardCall, type MoonshotCall,
} from './moonshot';

const call = (over: Partial<MoonshotCall> = {}): MoonshotCall => ({
  id: 'm1', teamId: 'tA', raceId: 'austin_2026', roundNumber: 19, driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200,
  modelProbability: 0.11, rewardBand: 'MOONSHOT', multiplier: 5, potentialReward: 1000, ownsDriver: false, status: 'CONFIRMED', lockAtMs: 2_000, result: null, officialDriverFinish: null, adjustmentAmount: null, ...over,
});

describe('formatting', () => {
  it('labels, chances, multipliers and signed numbers, in the portal’s sentence case', () => {
    expect(predictionLabel('TOP_5')).toBe('Top 5'); expect(predictionLabel('EXACT_FINISH', 7)).toBe('Finish P7');
    expect(chancePct(0.1149)).toBe('11%'); expect(multiplierLabel(1.25)).toBe('1.25×'); expect(multiplierLabel(5)).toBe('5×');
    expect(signed(1000)).toBe('+1,000'); expect(signed(-200)).toBe('−200');
    expect(outcomeLine(200, 1000)).toBe('Hit +1,000 · Miss −200');
    expect(stakeOptions([50, 100, 200]).map((s) => s.label)).toEqual(['Cautious', 'Bold', 'All-in']);
  });
  it('the summary, settled and declaration lines', () => {
    expect(callSummary(call(), 'Hadjar')).toBe('Hadjar — Podium · 200 points at risk · 5× · Hit +1,000 · Miss −200');
    expect(settledLine(call({ result: 'HIT', officialDriverFinish: 3, adjustmentAmount: 1000 }), 'Hadjar')).toBe('Moonshot hit · Hadjar — Podium · finished P3 · +1,000 points');
    expect(settledLine(call({ result: 'VOID', adjustmentAmount: 0 }), 'Hadjar')).toBe('Moonshot void · token returned · Hadjar — Podium · not classified');
    const b: BoardCall = { ...call(), userId: 'u2', displayName: 'Mike', teamName: 'Turn One', status: 'LOCKED' };
    expect(declarationLine(b, 'Hadjar')).toBe('Turn One called Hadjar Podium · 200 pts · 5×');
    for (const l of [callSummary(call(), 'Hadjar'), settledLine(call({ result: 'MISSED', officialDriverFinish: 4, adjustmentAmount: -200 }), 'Hadjar'), declarationLine(b, 'Hadjar')]) expect(usesForbiddenTerm(l)).toBeNull();
  });
  it('the season record', () => {
    const lines = statsLines({ used: 3, hit: 1, missed: 2, voided: 0, pointsRisked: 500, pointsWon: 1000, cashRisked: 0, cashWon: 0, biggestHit: { adjustmentAmount: 1000, driverId: 'hadjar', predictionType: 'PODIUM' } }, (id) => (id === 'hadjar' ? 'Hadjar' : id));
    expect(lines.map((l) => l[0])).toEqual(['Moonshots used', 'Hit · missed', 'Hit rate', 'Points risked · won', 'Biggest hit']);
    expect(lines[2][1]).toBe('33%'); expect(lines[4][1]).toBe('Hadjar Podium · +1,000');
    expect(statsLines(null, (id) => id)).toEqual([]);
  });
});

describe('time and terms', () => {
  it('a quote is fresh until its expiry; a call is open until its lock; changed terms are not the same', () => {
    expect(quoteFresh({ expiresAt: 2_000 }, 1_000)).toBe(true); expect(quoteFresh({ expiresAt: 2_000 }, 2_000)).toBe(false);
    expect(callOpen(call(), 1_000)).toBe(true); expect(callOpen(call(), 2_000)).toBe(false); expect(callOpen(call({ status: 'LOCKED' }), 1_000)).toBe(false);
    const q = { multiplier: 5, potentialReward: 1000, rewardBand: 'MOONSHOT' };
    expect(sameTerms(q, { ...q })).toBe(true); expect(sameTerms(q, { ...q, multiplier: 2.5 })).toBe(false);
  });
});

describe('the depth view', () => {
  it('bars scale to the likeliest position and mark the predicted finish; predictions cover their positions', () => {
    const bars = distributionBars({ predicted: 3.4, positions: [0.1, 0.2, 0.4, 0.2, 0.1] });
    expect(bars.map((b) => b.height)).toEqual([25, 50, 100, 50, 25]);
    expect(bars.find((b) => b.predicted)?.position).toBe(3);
    expect(distributionBars(null)).toEqual([]);
    expect(coveredPositions('PODIUM')).toEqual([1, 2, 3]); expect(coveredPositions('EXACT_FINISH', 7)).toEqual([7]); expect(coveredPositions('EXACT_FINISH')).toEqual([]);
  });
});

describe('the wire', () => {
  it('documents become calls whatever the date shape; refusals read as written', () => {
    const base = { teamId: 'tA', raceId: 'r', driverId: 'hadjar', predictionType: 'WIN', stakeCurrency: 'POINTS', stakeAmount: 100, multiplier: 5, potentialReward: 500, status: 'CONFIRMED' };
    expect(toCall('m', { ...base, lockAt: { toMillis: () => 5_000 } }).lockAtMs).toBe(5_000);
    expect(toCall('m', { ...base, lockAt: { _seconds: 7 } }).lockAtMs).toBe(7_000);
    expect(toCall('m', { ...base, lockAtMs: 9_000 }).lockAtMs).toBe(9_000);
    expect(toCall('m', { teamId: 'tA', status: 'HIT', result: 'HIT' }).stakeAmount).toBe(0);
    expect(moonshotErrorText({ code: 'functions/failed-precondition', message: 'Selections are locked for this race.' })).toBe('Selections are locked for this race.');
    expect(moonshotErrorText({ code: 'functions/unavailable', message: 'INTERNAL' })).toMatch(/not answering/);
    expect(moonshotErrorText(new Error(''))).toBe('Something went wrong. Try again.');
  });
});

describe('race day', () => {
  it('IN inside the prediction, CLOSE one place outside, OUT beyond, PENDING without a position; the live document keeps usable positions', () => {
    const podium = call();
    expect([liveState(podium, 3), liveState(podium, 4), liveState(podium, 5), liveState(podium, null)]).toEqual(['IN', 'CLOSE', 'OUT', 'PENDING']);
    expect(liveState(call({ predictionType: 'WIN' }), 2)).toBe('CLOSE');
    expect(liveChip('CLOSE')).toBe('One position away');
    expect(toLiveDoc({ raceId: 'r', sessionKey: 2, byDriver: { hadjar: 4, bad: 'x', zero: 0 }, at: { toMillis: () => 5_000 } })).toEqual({ raceId: 'r', sessionKey: 2, byDriver: { hadjar: 4 }, atMs: 5_000 });
    expect(toLiveDoc(undefined)).toBeNull();
  });
});
