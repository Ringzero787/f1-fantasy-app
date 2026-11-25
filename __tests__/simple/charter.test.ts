/**
 * F-175 slice 4: the grid's Charter rules, and parity of the search-order copy with the server's
 * functions/src/charter/rankUp.ts (the app cannot bundle server code, so it keeps a copy).
 */
import {
  approvalCap, charterFlagOn, charterOfferVisible, charterShareText, climb, climbedThisWeek, isChartered,
  orderChartered, rankUpLabel, rankUpsCaption, rankUpsReceived, rankUpsThisWeek, requestCaption, shouldShowUnlock, weekId,
} from '../../src/simple/grid/charter';
import * as server from '../../functions/src/charter/rankUp';

const NOW = Date.UTC(2026, 10, 25, 12); // Wed 2026-11-25
const LATER = NOW + 30 * 86400000;
const charter = (expiresAt = LATER) => ({ chartered: true, charter: { season: '2026', expiresAt, buyerId: 'o', source: 'play' as const, ref: 'r', purchasedAt: 0 } });

describe('isChartered', () => {
  it('needs the flag and an unexpired charter', () => {
    expect(isChartered(charter(), NOW)).toBe(true);
    expect(isChartered({ ...charter(), chartered: false }, NOW)).toBe(false);
    expect(isChartered(charter(NOW - 1), NOW)).toBe(false);
    expect(isChartered({ chartered: true }, NOW)).toBe(false);
    expect(isChartered(null, NOW)).toBe(false);
  });
});

describe('the offer', () => {
  const on = { flagOn: true, contentOpen: false, amazon: false, demo: false, price: '$39.99' };
  it('shows only with the flag on, content closed, a store price, off Amazon and out of demo', () => {
    expect(charterOfferVisible(on)).toBe(true);
    expect(charterOfferVisible({ ...on, flagOn: false })).toBe(false);
    expect(charterOfferVisible({ ...on, contentOpen: true })).toBe(false);
    expect(charterOfferVisible({ ...on, amazon: true })).toBe(false);
    expect(charterOfferVisible({ ...on, demo: true })).toBe(false);
    expect(charterOfferVisible({ ...on, price: undefined })).toBe(false);
    expect(charterOfferVisible({ ...on, price: '' })).toBe(false);
  });
  it('reads config/app.charter fail-closed', () => {
    expect(charterFlagOn({ enabled: true })).toBe(true);
    for (const v of [undefined, null, true, 'true', { enabled: 'true' }, { enabled: 1 }, {}]) expect(charterFlagOn(v)).toBe(false);
  });
});

describe('approvalCap', () => {
  it('is 22 plus paid slots while chartered, never more than maxMembers', () => {
    expect(approvalCap({ maxMembers: 22, ...charter() }, NOW)).toBe(22);
    expect(approvalCap({ maxMembers: 28, paidSlots: 6, ...charter() }, NOW)).toBe(28);
    // a maxMembers raised for free (old builds) is not covered
    expect(approvalCap({ maxMembers: 42, paidSlots: 3, ...charter() }, NOW)).toBe(25);
  });
  it('is maxMembers in an ordinary league', () => {
    expect(approvalCap({ maxMembers: 42 }, NOW)).toBe(42);
    expect(approvalCap({ maxMembers: 0 }, NOW)).toBe(22);
  });
});

describe('copy', () => {
  it('share text uses the /join?code= route the app handles', () => {
    const t = charterShareText('Paddock Pals', 'Sam', 'PAD-1234');
    expect(t).toBe('PADDOCK PALS is chartered.\nPit Wall is on for everyone in it.\nSam paid for the season.\n\nAsk to join with PAD-1234\nhttps://undercut.humannpc.com/join?code=PAD-1234');
  });
  it('request caption', () => expect(requestCaption('Paddock Pals', 21, 22)).toBe('Paddock Pals · 21 of 22'));
  it('public row caption is singular for one', () => {
    expect(rankUpsCaption(1)).toBe('1 RANK UP');
    expect(rankUpsCaption(0)).toBe('0 RANK UPS');
    expect(rankUpsCaption(4)).toBe('4 RANK UPS');
  });
  it('rank up label: RANK UP until spent, then the count only', () => {
    expect(rankUpLabel(false, 4)).toBe('RANK UP');
    expect(rankUpLabel(true, 4)).toBe('4');
    expect(rankUpLabel(true, 0)).toBe('0');
  });
  it('counts Rank Ups received per player', () => {
    const m = rankUpsReceived([{ toUid: 'a' }, { toUid: 'b' }, { toUid: 'a' }, { toUid: 7 }]);
    expect(m.get('a')).toBe(2);
    expect(m.get('b')).toBe(1);
    expect(m.size).toBe(2);
  });
});

describe('the unlock sheet', () => {
  const base = { chartered: true, isOwner: false, pending: false, seen: false };
  it('shows once to an approved member of a chartered league', () => {
    expect(shouldShowUnlock(base)).toBe(true);
    expect(shouldShowUnlock({ ...base, seen: true })).toBe(false);
    expect(shouldShowUnlock({ ...base, isOwner: true })).toBe(false);
    expect(shouldShowUnlock({ ...base, pending: true })).toBe(false);
    expect(shouldShowUnlock({ ...base, chartered: false })).toBe(false);
  });
});

describe('parity with functions/src/charter/rankUp.ts', () => {
  it('weekId matches across a Sunday/Monday UTC boundary and the ISO year edge', () => {
    for (const ms of [Date.UTC(2026, 10, 29, 23, 59), Date.UTC(2026, 10, 30, 0, 0), Date.UTC(2027, 0, 1), Date.UTC(2027, 0, 4), NOW]) {
      expect(weekId(ms)).toBe(server.weekId(ms));
    }
    expect(weekId(Date.UTC(2027, 0, 1))).toBe('2026-W53');
  });
  it('climb matches', () => {
    for (const c of [-1, 0, 1, 2, 3, 22, NaN]) expect(climb(c)).toBe(server.climb(c));
  });
  it('orderChartered matches, with two climbers, a points tie, unchartered and private leagues', () => {
    const wk = { weekId: weekId(NOW), count: 0 };
    const leagues = [
      { id: 'a', isPublic: true, searchPoints: 900, ...charter(), rankUpsWeek: { ...wk, count: 0 } },
      { id: 'b', isPublic: true, searchPoints: 800, ...charter(), rankUpsWeek: { ...wk, count: 1 } },
      { id: 'c', isPublic: true, searchPoints: 700, ...charter(), rankUpsWeek: { ...wk, count: 5 } },
      { id: 'd', isPublic: true, searchPoints: 700, ...charter(), rankUpsWeek: { weekId: '2026-W01', count: 9 } },
      { id: 'e', isPublic: true, memberCount: 12 },
      { id: 'f', isPublic: true, memberCount: 20 },
      { id: 'g', isPublic: false, ...charter(), searchPoints: 5000 },
      { id: 'h', isPublic: true, searchPoints: 9999, ...charter(NOW - 1), memberCount: 1 },
    ];
    const mine = orderChartered(leagues, NOW).map((l) => l.id);
    expect(mine).toEqual(server.orderChartered(leagues as never, NOW).map((l) => l.id));
    expect(mine).toEqual(['c', 'b', 'a', 'd', 'f', 'e', 'h']);
  });
  it('rankUpsThisWeek ignores a stale week, and climbedThisWeek is 0 for an unchartered league', () => {
    expect(rankUpsThisWeek({ rankUpsWeek: { weekId: '2026-W01', count: 3 } }, NOW)).toBe(0);
    expect(rankUpsThisWeek({ rankUpsWeek: { weekId: weekId(NOW), count: 3 } }, NOW)).toBe(server.rankUpsThisWeek({ rankUpsWeek: { weekId: weekId(NOW), count: 3 } }, NOW));
    expect(climbedThisWeek({ id: 'x', rankUpsWeek: { weekId: weekId(NOW), count: 3 } }, NOW)).toBe(0);
    expect(climbedThisWeek({ id: 'x', ...charter(), rankUpsWeek: { weekId: weekId(NOW), count: 7 } }, NOW)).toBe(3);
  });
});
