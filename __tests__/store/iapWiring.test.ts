/**
 * The in-app purchase lifecycle has to be started by someone.
 *
 * `initializeIAP` opens the StoreKit/Play connection and registers `purchaseUpdatedListener`, and
 * that listener is the only path from a completed purchase to the server grant. It had no call site
 * in any released version, so the whole purchase path was dead: a buyer could be charged and the
 * pass never granted, and because StoreKit redelivers an unfinished transaction to a listener that
 * does not exist, it would never resolve on a later launch either. The `purchases` collection was
 * empty for exactly this reason.
 *
 * Nothing else catches this. Every unit test passes with the call site missing, the app builds,
 * launches and renders, and the failure only appears when real money is involved. So this is a
 * static check: somewhere outside the store itself, the lifecycle is started and stopped.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const STORE = path.join('src', 'store', 'purchase.store.ts');

const sources = (dir: string, out: string[] = []): string[] => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) sources(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
};

const callersOf = (fn: string): string[] =>
  [...sources('app'), ...sources('src')]
    .filter((f) => f !== STORE)
    .filter((f) => new RegExp(`\\.${fn}\\s*\\(`).test(fs.readFileSync(path.join(root, f), 'utf8')));

describe('in-app purchase lifecycle', () => {
  it('is started somewhere outside the store, or no purchase can ever complete', () => {
    expect(callersOf('initializeIAP')).not.toEqual([]);
  });

  it('is torn down too, so a reload does not stack listeners', () => {
    expect(callersOf('cleanupIAP')).not.toEqual([]);
  });

  it('starts at the app root, because a redelivered transaction arrives before any screen', () => {
    // Not merely "somewhere": StoreKit replays an unfinished purchase at launch, so the listener
    // has to exist before routing or sign-in, not once some screen that sells something mounts.
    expect(callersOf('initializeIAP')).toContain(path.join('app', '_layout.tsx'));
  });

  it('asks the store what it is still holding, or a failed grant strands the money', () => {
    // The store keeps a purchase until the app finishes it, and the app only finishes one after the
    // server grants. A grant that fails therefore leaves a paid purchase with the store, the buyer
    // unable to buy again because they already own it, and — until this existed — nothing ever
    // asking for it back. This happened on the first real purchase.
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    expect(store).toMatch(/getAvailablePurchases\s*\(/);
    // Called from inside initializeIAP, which is itself called from the app root — so a launch is
    // enough to recover one, with no screen to visit and nothing for the buyer to do.
    // Anchor on the implementations, not the interface above them, or the slice runs backwards.
    const init = store.slice(store.indexOf('initializeIAP: async'), store.indexOf('cleanupIAP: () => {'));
    expect(init.length).toBeGreaterThan(100);
    expect(init).toMatch(/replayHeldPurchases\s*\(/);
  });

  it('replays through the same handler a live purchase uses, so grant and finish are not duplicated', () => {
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    const body = store.slice(store.indexOf('replayHeldPurchases: async'));
    const replay = body.slice(0, body.indexOf('syncPurchasesFromServer: async'));
    expect(replay.length).toBeGreaterThan(100);
    expect(replay).toMatch(/handlePurchaseComplete/);
    // It must not finish a transaction itself; only the handler does that, and only after a grant.
    expect(replay).not.toMatch(/finishTransaction/);
  });

  it('marks a replay as a replay, or the double-grant guard cannot tell one apart', () => {
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    const body = store.slice(store.indexOf('replayHeldPurchases: async'));
    const replay = body.slice(0, body.indexOf('syncPurchasesFromServer: async'));
    expect(replay).toMatch(/handlePurchaseComplete\([^)]*,\s*\{\s*isReplay:\s*true\s*\}\s*\)/);
  });

  it('asks the server before granting a consumable, and finishes only after recording the grant', () => {
    // This ordering IS the fix for the per-launch double grant (F-092). Granting first and
    // recording afterwards — with the failure swallowed, as it was — turned one payment into one
    // credit on every launch for any purchase the store could not finish. A refactor that moves
    // the grant back above the server call, or the finish above the honoured-list write, restores
    // the bug exactly, and no behavioural test would notice: it needs a real store, a real
    // payment and a failed consume.
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    const body = store.slice(store.indexOf('handlePurchaseComplete: async'));
    const handler = body.slice(0, body.indexOf('handlePurchaseError:'));
    expect(handler.length).toBeGreaterThan(500);

    const consumables = handler.slice(0, handler.indexOf('PRODUCT_IDS.PITWALL_PASS'));
    const askedServer = consumables.indexOf('recordPurchaseOnServer');
    const decided = consumables.indexOf('grantDecision');
    const granted = consumables.search(/pendingExpansionCredits:\s*state\.pendingExpansionCredits \+ 1/);
    // The LAST of each: the terminal-refusal path above also remembers and finishes, deliberately
    // and without granting, so the first occurrence of either is not the one being ordered here.
    const remembered = consumables.lastIndexOf('rememberHonoured');
    const finished = consumables.lastIndexOf('finishTransaction');

    // Every step is still there at all — a reorder that deleted one would otherwise pass by
    // comparing -1 against -1.
    expect({ askedServer, decided, granted, remembered, finished }).toEqual({
      askedServer: expect.any(Number), decided: expect.any(Number),
      granted: expect.any(Number), remembered: expect.any(Number), finished: expect.any(Number),
    });
    for (const at of [askedServer, decided, granted, remembered, finished]) expect(at).toBeGreaterThan(-1);

    expect(askedServer).toBeLessThan(granted);
    expect(decided).toBeLessThan(granted);
    // The grant comes before the record of it: remembering first and then throwing would mark a
    // transaction honoured that granted nothing, and nothing would ever grant it.
    expect(granted).toBeLessThan(remembered);
    expect(remembered).toBeLessThan(finished);
  });

  it('finishes the replay before reconciling with the server, or they grant twice between them', () => {
    // The replay records a purchase with the server before granting it locally. A sync running
    // alongside could read the server's copy while the local history was still empty, decide it
    // was a credit short, and top up — one payment, two credits, through the other door.
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    const init = store.slice(store.indexOf('initializeIAP: async'), store.indexOf('cleanupIAP: () => {'));
    const replay = init.indexOf('replayHeldPurchases');
    const sync = init.indexOf('syncPurchasesFromServer');
    expect(replay).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(replay);
    // Awaited, or the ordering in the source means nothing at runtime.
    expect(init).toMatch(/await\s+get\(\)\.replayHeldPurchases\(\)/);
    expect(init).toMatch(/await\s+get\(\)\.syncPurchasesFromServer\(\)/);
  });

  it('records what the server sync topped up, or it tops up again every launch', () => {
    // The sync compares server counts against purchaseHistory. A top-up that did not write the
    // history rows it came from recomputed the same gap on the next launch and applied it again.
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    const body = store.slice(store.indexOf('syncPurchasesFromServer: async'));
    const sync = body.slice(0, body.indexOf('purchaseLeagueExpansion: async'));
    expect(sync.length).toBeGreaterThan(200);
    expect(sync).toMatch(/updates\.purchaseHistory/);
    // And the avatar pack is restored rather than logged at: it is the one product the count
    // comparison cannot recover from without attributing credits to an account.
    expect(sync).toMatch(/updates\.bonusAvatarCredits/);
  });

  it('registers the listener that carries a purchase to the server', () => {
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    // These three are what make a purchase land: open the connection, hear about the result, and
    // send it on. Losing any one of them silently breaks paying customers only.
    expect(store).toMatch(/initConnection\s*\(/);
    expect(store).toMatch(/purchaseUpdatedListener\s*\(/);
    expect(store).toMatch(/handlePurchaseComplete/);
  });
});
