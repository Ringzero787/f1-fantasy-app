// F-142: names in the market, the league feed and the league tables.
import { surnameOf } from '../../src/simple/grid/tileState';
import { activityShortLine, boardShortLine } from '../../src/simple/grid/moonshot';
import { calloutNames, headlineOf, sublineOf } from '../../src/simple/grid/roundReport';

describe('surnameOf', () => {
  it('skips a generational suffix', () => {
    expect(surnameOf('Carlos Sainz Jr.')).toBe('Sainz');
    expect(surnameOf('Carlos Sainz Jr')).toBe('Sainz');
    expect(surnameOf('Someone Smith III')).toBe('Smith');
  });
  it('keeps the plain cases', () => {
    expect(surnameOf('Lando Norris')).toBe('Norris');
    expect(surnameOf('Kimi Antonelli')).toBe('Antonelli');
    expect(surnameOf('Zhou')).toBe('Zhou');
    expect(surnameOf('Jr.')).toBe('Jr.');
  });
});

describe('Moonshot feed one-liners', () => {
  it('a called shot: what it pays, and the team', () => {
    expect(boardShortLine({ potentialReward: 1000, stakeCurrency: 'POINTS' }, 'Box Box Boys')).toBe('🚀 MOONSHOT +1,000 POINTS · BOX BOX BOYS');
  });
  it('a settled shot: the points it moved, and the team', () => {
    expect(activityShortLine({ type: 'MOONSHOT_HIT', adjustmentAmount: 1000, stakeCurrency: 'POINTS' }, 'Box Box Boys')).toBe('🔥 MOONSHOT +1,000 POINTS · BOX BOX BOYS');
    expect(activityShortLine({ type: 'MOONSHOT_MISSED', adjustmentAmount: -200, stakeCurrency: 'POINTS' }, 'Grid Rats')).toBe('💥 MOONSHOT −200 POINTS · GRID RATS');
    expect(activityShortLine({ type: 'MOONSHOT_VOID', adjustmentAmount: 0, stakeCurrency: 'CASH' }, 'Grid Rats')).toBe('↩ MOONSHOT VOID · GRID RATS');
  });
  it('never names the player', () => {
    const line = boardShortLine({ potentialReward: 50, stakeCurrency: 'CASH' }, 'Team');
    expect(line).not.toMatch(/CALLED/);
  });
});

describe('team first, player second', () => {
  const p = (name: string, team: string, isMe = false) => ({ userId: name, name, team, isMe });
  it('the headline is the team, the small line the player', () => {
    expect(headlineOf(p('Sam Okafor', 'Box Box Boys'))).toBe('Box Box Boys');
    expect(sublineOf(p('Sam Okafor', 'Box Box Boys'))).toBe('Sam Okafor');
  });
  it('a member with no team name falls back to the player, with no second line', () => {
    expect(headlineOf(p('Sam Okafor', ''))).toBe('Sam Okafor');
    expect(sublineOf(p('Sam Okafor', ''))).toBeNull();
  });
  it('callouts name teams', () => {
    expect(calloutNames({ people: [p('Sam', 'Box Box Boys')], value: 1, includesMe: false })).toBe('BOX BOX BOYS');
    expect(calloutNames({ people: [p('me', 'Mine', true), p('Sam', 'Grid Rats')], value: 1, includesMe: true })).toBe('YOU & GRID RATS');
  });
});
