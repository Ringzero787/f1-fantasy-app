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

  it('registers the listener that carries a purchase to the server', () => {
    const store = fs.readFileSync(path.join(root, STORE), 'utf8');
    // These three are what make a purchase land: open the connection, hear about the result, and
    // send it on. Losing any one of them silently breaks paying customers only.
    expect(store).toMatch(/initConnection\s*\(/);
    expect(store).toMatch(/purchaseUpdatedListener\s*\(/);
    expect(store).toMatch(/handlePurchaseComplete/);
  });
});
