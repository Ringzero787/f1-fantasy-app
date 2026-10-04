/**
 * Real team reads and saves (F-073). Reads use the same documents the app reads. Saves go
 * through the app's server callables only; the sole direct write is the Ace field, which the
 * rules already let an owner set (the app does the same).
 */
import { callable, firestore } from './firebase';
import type { MarketPrices, Plan, RealTeam, RosterConstructor, RosterDriver, Step } from '../data/team';

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * F-095: `lockStatus.aceLockTime` as epoch ms. A Firestore Timestamp when the weekend is
 * locked, null the rest of the time, and absent on teams written before the field existed
 * — all three mean "no deadline the portal should enforce".
 */
const stampMs = (lockStatus: unknown): number | null => {
  const t = (lockStatus as { aceLockTime?: { toMillis?: () => number } } | null | undefined)?.aceLockTime;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
};

export async function loadTeams(uid: string): Promise<RealTeam[]> {
  const { m, db } = await firestore();
  const snap = await m.getDocs(m.query(m.collection(db, 'fantasyTeams'), m.where('userId', '==', uid), m.limit(3)));
  return snap.docs.map((d) => {
    const t = d.data();
    const ctor = Object.prototype.hasOwnProperty.call(t, 'constructor') && t.constructor && typeof t.constructor === 'object' ? (t.constructor as RosterConstructor) : null;
    return {
      id: d.id, name: typeof t.name === 'string' ? t.name : 'Team', leagueId: typeof t.leagueId === 'string' ? t.leagueId : null,
      drivers: Array.isArray(t.drivers) ? (t.drivers as RosterDriver[]).filter((x) => x && typeof x.driverId === 'string') : [],
      constructor: ctor && typeof ctor.constructorId === 'string' ? ctor : null,
      budget: num(t.budget, 0), isLocked: t.isLocked === true, aceLockTime: stampMs(t.lockStatus), aceDriverId: typeof t.aceDriverId === 'string' ? t.aceDriverId : null,
      totalPoints: num(t.totalPoints), lockedPoints: num(t.lockedPoints), driverLockouts: (t.driverLockouts && typeof t.driverLockouts === 'object' ? t.driverLockouts : {}) as Record<string, number>,
    };
  });
}

export async function loadMarket(): Promise<MarketPrices & { completedRaces: number }> {
  const { m, db } = await firestore();
  const [drivers, ctors, races] = await Promise.all([
    m.getDocs(m.collection(db, 'drivers')), m.getDocs(m.collection(db, 'constructors')),
    m.getDocs(m.query(m.collection(db, 'races'), m.where('seasonId', '==', '2026'), m.where('status', '==', 'completed'))),
  ]);
  const out: MarketPrices = { drivers: {}, constructors: {} };
  drivers.forEach((d) => { const x = d.data(); out.drivers[d.id] = { price: num(x.price), name: typeof x.name === 'string' ? x.name : d.id, isActive: x.isActive !== false }; });
  ctors.forEach((d) => { const x = d.data(); out.constructors[d.id] = { price: num(x.price), name: typeof x.name === 'string' ? x.name : d.id }; });
  return { ...out, completedRaces: races.size };
}

export interface SaveProgress { done: number; total: number; step: Step | 'ace' | null }

/** Replays a plan through the callables in order. Stops at the first failure; earlier steps stay applied, as in the app. */
export async function executePlan(teamId: string, plan: Plan, ace: string | null, onProgress?: (p: SaveProgress) => void): Promise<void> {
  const total = plan.steps.length + (ace !== null ? 1 : 0);
  let done = 0;
  const tick = (step: Step | 'ace' | null) => onProgress?.({ done, total, step });
  for (const s of plan.steps) {
    tick(s);
    if (s.op === 'sellDriver') await (await callable<{ teamId: string; driverId: string }, unknown>('removeDriverSecure'))({ teamId, driverId: s.id });
    else if (s.op === 'removeConstructor') await (await callable<{ teamId: string }, unknown>('removeConstructorSecure'))({ teamId });
    else if (s.op === 'setConstructor') await (await callable<{ teamId: string; constructorId: string; contractLength: number }, unknown>('setConstructorSecure'))({ teamId, constructorId: s.id, contractLength: s.contractLength });
    else await (await callable<{ teamId: string; driverId: string; contractLength: number }, unknown>('addDriverSecure'))({ teamId, driverId: s.id, contractLength: s.contractLength });
    done++;
  }
  if (ace !== null) {
    tick('ace');
    // The Ace is the one field the app itself writes directly: the rules let an owner set
    // aceDriverId and deny every field that carries money or points, and scoring re-checks the
    // price cap when it counts the weekend, so a forged Ace earns nothing. There is no
    // setAceSecure callable to route through.
    
    const { m, db } = await firestore();
    try {
      await m.updateDoc(m.doc(db, 'fantasyTeams', teamId), { aceDriverId: ace || null, updatedAt: m.serverTimestamp() });
    } catch (e) {
      // F-095: the ace is the one step that is not a callable, so a refusal arrives as a
      // bare permission-denied with no sentence in it. Say what it means HERE, where we
      // know which write was refused — reading every permission-denied as a race-start
      // lock would mislabel a revoked session or a rules regression on any other step.
      if ((e as { code?: string }).code?.endsWith('permission-denied')) {
        throw new Error('The race has started, so your ace is set for this round. Nothing more was changed.');
      }
      throw e;
    }
    done++;
  }
  tick(null);
}

/** Server error to a sentence a player understands. */
export function saveErrorText(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  const msg = (e as { message?: string }).message ?? '';
  // F-095 translates the ace refusal at the write itself (executePlan), where it is clear
  // WHICH step was refused; a blanket permission-denied branch here would report a revoked
  // session or a rules regression on any other step as a race-start lock.
  if (/your ace is set for this round/.test(msg)) return msg;
  if (/locked/i.test(msg) || code.endsWith('failed-precondition') && /lock/i.test(msg)) return 'Your team is locked for this weekend. Nothing more was changed.';
  if (/Insufficient budget|budget/i.test(msg)) return 'The server found the bank short after fees. Nothing more was changed.';
  if (/lockout|cannot be re-added|re-bought/i.test(msg)) return 'That driver just left your team and cannot come back yet. Nothing more was changed.';
  if (code.endsWith('unauthenticated')) return 'You are signed out. Sign in again and retry.';
  return msg ? `The server refused this step: ${msg}` : 'Saving did not finish. Check your team in the app.';
}
