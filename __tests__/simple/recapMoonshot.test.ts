// F-127: the weekend recap's Moonshot card — which call it shows and the words it uses.
import { recapMoonshot, recapMoonshotLines, usesForbiddenTerm, parseMoonshotConfig, type MoonshotCall } from '../../src/simple/grid/moonshot';

const call = (over: Partial<MoonshotCall> = {}): MoonshotCall => ({
  id: 'm1', teamId: 'tA', raceId: 'usa_2026', roundNumber: 20, driverId: 'verstappen', predictionType: 'WIN', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200,
  modelProbability: 0.3, rewardBand: 'LONGSHOT', multiplier: 2.5, potentialReward: 500, ownsDriver: false, status: 'MISSED', lockAtMs: 1_000, result: 'MISSED', officialDriverFinish: 3, adjustmentAmount: -200, ...over,
});

describe('recapMoonshot picks the team’s settled call on the race', () => {
  it('finds the settled call for this team and race', () => {
    expect(recapMoonshot([call()], 'tA', 'usa_2026')?.id).toBe('m1');
  });
  it('shows nothing while the call is still open or locked', () => {
    expect(recapMoonshot([call({ status: 'CONFIRMED', result: null, officialDriverFinish: null, adjustmentAmount: null })], 'tA', 'usa_2026')).toBeNull();
    expect(recapMoonshot([call({ status: 'LOCKED', result: null })], 'tA', 'usa_2026')).toBeNull();
  });
  it('ignores a cancelled call, the other team’s call and another race', () => {
    expect(recapMoonshot([call({ status: 'CANCELLED', result: null })], 'tA', 'usa_2026')).toBeNull();
    expect(recapMoonshot([call({ teamId: 'tB' })], 'tA', 'usa_2026')).toBeNull();
    expect(recapMoonshot([call({ raceId: 'mexico_2026' })], 'tA', 'usa_2026')).toBeNull();
    expect(recapMoonshot([], 'tA', 'usa_2026')).toBeNull();
    expect(recapMoonshot([call()], null, 'usa_2026')).toBeNull();
    expect(recapMoonshot([call()], 'tA', null)).toBeNull();
  });
  it('a two-team player sees each team’s own call', () => {
    const calls = [call({ id: 'a', teamId: 'tA' }), call({ id: 'b', teamId: 'tB', result: 'HIT', status: 'HIT', adjustmentAmount: 500 })];
    expect(recapMoonshot(calls, 'tA', 'usa_2026')?.id).toBe('a');
    expect(recapMoonshot(calls, 'tB', 'usa_2026')?.id).toBe('b');
  });
});

describe('recapMoonshotLines', () => {
  it('a miss on points: the call, the finish, the amount, and the weekend total', () => {
    const l = recapMoonshotLines(call(), 283, 'Verstappen');
    expect(l.outcome).toBe('MISSED');
    expect(l.state).toBe('MISSED');
    expect(l.call).toBe('VERSTAPPEN — WIN');
    expect(l.finish).toBe('FINISHED P3');
    expect(l.amount).toBe('−200 POINTS');
    expect(l.total).toBe('ROSTER +283 · MOONSHOT −200 · WEEKEND +83');
    expect(l.spoken).toBe('Moonshot missed: you called Verstappen win, finished P3, minus 200 points');
  });
  it('a hit on points adds to the weekend', () => {
    const l = recapMoonshotLines(call({ status: 'HIT', result: 'HIT', predictionType: 'PODIUM', officialDriverFinish: 2, adjustmentAmount: 1000 }), 150, 'Hadjar');
    expect(l.state).toBe('HIT');
    expect(l.call).toBe('HADJAR — PODIUM');
    expect(l.amount).toBe('+1,000 POINTS');
    expect(l.total).toBe('ROSTER +150 · MOONSHOT +1,000 · WEEKEND +1,150');
    expect(l.spoken).toContain('plus 1,000 points');
  });
  it('a cash stake is named as cash and never added to points', () => {
    const l = recapMoonshotLines(call({ stakeCurrency: 'CASH', stakeAmount: 100, adjustmentAmount: -100 }), 283, 'Verstappen');
    expect(l.amount).toBe('−100 CASH');
    expect(l.total).toBe('ROSTER +283 · MOONSHOT −100 CASH');
    expect(l.spoken).toContain('minus 100 of cash');
  });
  it('a void returns the token and changes nothing', () => {
    const l = recapMoonshotLines(call({ status: 'VOID', result: 'VOID', officialDriverFinish: null, adjustmentAmount: 0 }), 283, 'Verstappen');
    expect(l.outcome).toBe('VOID');
    expect(l.state).toBe('VOID');
    expect(l.finish).toBe('MOONSHOT VOID · TOKEN RETURNED');
    expect(l.amount).toBeNull();
    expect(l.total).toBeNull();
    expect(l.spoken).toBe('Moonshot void: you called Verstappen win, void, token returned');
  });
  it('a driver who did not finish is not classified', () => {
    const l = recapMoonshotLines(call({ officialDriverFinish: null }), 10, 'Verstappen');
    expect(l.finish).toBe('NOT CLASSIFIED');
  });
  it('a negative roster still adds up', () => {
    expect(recapMoonshotLines(call(), -20, 'Verstappen').total).toBe('ROSTER −20 · MOONSHOT −200 · WEEKEND −220');
  });
  it('the exact-finish target reads in the call', () => {
    expect(recapMoonshotLines(call({ predictionType: 'EXACT_FINISH', predictionTarget: 7 }), 0, 'Lawson').call).toBe('LAWSON — FINISH P7');
  });
  it('the server’s words win for the state, unless they break the vocabulary', () => {
    expect(recapMoonshotLines(call(), 0, 'Verstappen', parseMoonshotConfig({ copy: { stateMissed: 'NOT THIS TIME' } })).state).toBe('NOT THIS TIME');
    expect(recapMoonshotLines(call(), 0, 'Verstappen', parseMoonshotConfig({ copy: { stateMissed: 'LOST THE BET' } })).state).toBe('MISSED');
  });
  it('nothing the card says uses a forbidden word', () => {
    for (const c of [call(), call({ status: 'HIT', result: 'HIT', adjustmentAmount: 500 }), call({ status: 'VOID', result: 'VOID' }), call({ stakeCurrency: 'CASH' })]) {
      const l = recapMoonshotLines(c, 283, 'Verstappen');
      for (const text of [l.state, l.call, l.finish, l.amount ?? '', l.total ?? '', l.spoken]) expect(usesForbiddenTerm(text)).toBeNull();
    }
  });
});
