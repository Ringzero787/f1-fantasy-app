/**
 * The double-grant guard (F-092).
 *
 * One payment used to become one credit per launch. `handlePurchaseComplete` granted a consumable
 * from the device before any server round trip, then finished the transaction, then recorded it
 * with the server and swallowed any failure. If the finish could not complete — offline, the
 * consume never reaching Play — the store handed the purchase back on the next start,
 * `replayHeldPurchases` fed it through the same handler, and another credit appeared. Nothing
 * remembered the transaction had been honoured.
 */
import { alreadyHonoured, grantDecision, rememberHonoured, HONOURED_CAP } from '../../src/store/purchaseGrant';
import { transactionKeyOf } from '../../src/pitwall/receipt';

const PLAY = { productId: 'league_expansion', purchaseToken: 'tok_play_1' };
const AMAZON = { productId: 'league_expansion', purchaseToken: 'receipt_amazon', userIdAmazon: 'amzn1.account.ABC' };
const APPLE = { productId: 'league_expansion', purchaseToken: 'a.b.c', transactionId: '2000000900' };

describe('transactionKeyOf', () => {
  it('keys on the identifier each store calls a transaction, the way the server does', () => {
    expect(transactionKeyOf(PLAY, 'android')).toBe('android:tok_play_1');
    expect(transactionKeyOf(AMAZON, 'android')).toBe('amazon:receipt_amazon');
    expect(transactionKeyOf(APPLE, 'ios')).toBe('ios:2000000900');
  });

  it('does not confuse two stores that happen to use the same identifier', () => {
    const sameId = { productId: 'league_slot', purchaseToken: 'X' };
    expect(transactionKeyOf(sameId, 'android')).not.toBe(transactionKeyOf({ ...sameId, userIdAmazon: 'a' }, 'android'));
  });

  it('is null when there is nothing stable to key on, rather than a key that collides', () => {
    expect(transactionKeyOf({ productId: 'league_slot' }, 'android')).toBeNull();
    expect(transactionKeyOf({ productId: 'league_slot', purchaseToken: '' }, 'android')).toBeNull();
    // iOS with a signed transaction but no transaction id: the receipt is not an identity.
    expect(transactionKeyOf({ productId: 'league_slot', purchaseToken: 'a.b.c' }, 'ios')).toBeNull();
  });
});

describe('rememberHonoured', () => {
  it('appends, de-duplicates and caps', () => {
    expect(rememberHonoured([], 'a')).toEqual(['a']);
    expect(rememberHonoured(['a'], 'b')).toEqual(['a', 'b']);
    expect(rememberHonoured(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(rememberHonoured(Array.from({ length: HONOURED_CAP }, (_, i) => `k${i}`), 'new')).toHaveLength(HONOURED_CAP);
    expect(rememberHonoured(Array.from({ length: HONOURED_CAP }, (_, i) => `k${i}`), 'new')).toContain('new');
  });

  it('has nothing to remember for a null key, and does not mutate what it was given', () => {
    const list = ['a'];
    expect(rememberHonoured(list, null)).toEqual(['a']);
    rememberHonoured(list, 'b').push('c');
    expect(list).toEqual(['a']);
  });
});

describe('grantDecision', () => {
  const base = { key: 'android:tok_play_1', honoured: [] as string[], duplicate: false, isReplay: false };

  it('grants a purchase nobody has seen before', () => {
    expect(grantDecision(base)).toBe('grant');
  });

  it('refuses the same transaction a second time — the bug this exists for', () => {
    // The store hands back an unfinished purchase on every launch. Each of those is a replay of
    // one payment, and only the first may grant anything.
    const honoured = rememberHonoured([], base.key);
    expect(grantDecision({ ...base, honoured, isReplay: true })).toBe('already-honoured');
    // And again, and again.
    expect(grantDecision({ ...base, honoured: rememberHonoured(honoured, base.key), isReplay: true })).toBe('already-honoured');
  });

  it('refuses it even when the server cannot be reached', () => {
    // `duplicate: false` is also what a caller passes when it never got to ask. The local list is
    // what makes the offline replay loop safe, which is exactly where the bug lived.
    expect(grantDecision({ ...base, honoured: [base.key], duplicate: false, isReplay: true })).toBe('already-honoured');
  });

  it('defers to the server for a purchase from another device or before a reinstall', () => {
    // The honoured list is per-device and is wiped by a reinstall; the server is not. Granting
    // here would double up with what syncPurchasesFromServer restores.
    expect(grantDecision({ ...base, duplicate: true })).toBe('server-already-has-it');
    expect(grantDecision({ ...base, duplicate: true, isReplay: true })).toBe('server-already-has-it');
  });

  it('still grants a live purchase with no identifier, but never replays one', () => {
    // Someone is standing there having just paid and the server says it is new, so grant it.
    expect(grantDecision({ ...base, key: null })).toBe('grant');
    // A replay with no identifier cannot be told apart from one already honoured.
    expect(grantDecision({ ...base, key: null, isReplay: true })).toBe('cannot-verify');
  });

  it('puts the local record ahead of the server flag, both ways round', () => {
    expect(grantDecision({ ...base, honoured: [base.key], duplicate: true })).toBe('already-honoured');
    expect(grantDecision({ ...base, honoured: ['android:other'], duplicate: false })).toBe('grant');
  });
});
