/**
 * F-155: is the portal reading a season that is over? `config/app` (signed-in read) names the
 * server's current season; the opener is round 1 of it (races are public). A failed read is "not
 * off-season": the round on screen stays, as before this check existed.
 */
import { firestore } from './firebase';
import { SEASON } from './env';
import { offSeason, type OffSeason } from '../data/offseason';

const toMs = (v: unknown): number | null => {
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
};

export async function loadOffSeason(): Promise<OffSeason | null> {
  try {
    const { m, db } = await firestore();
    const cfg = await m.getDoc(m.doc(db, 'config', 'app'));
    const state = offSeason(cfg.data()?.currentSeason, SEASON);
    if (!state) return null;
    // equality only (no composite index needed); a season is ~24 documents
    const snap = await m.getDocs(m.query(m.collection(db, 'races'), m.where('seasonId', '==', state.next))).catch(() => null);
    const races = (snap?.docs ?? []).map((d) => d.data() as Record<string, unknown>).filter((x) => typeof x.round === 'number');
    const r = races.sort((x, y) => (x.round as number) - (y.round as number))[0];
    const schedule = (r?.schedule ?? {}) as Record<string, unknown>;
    return r ? { ...state, opener: { name: String(r.name ?? r.country ?? r.city ?? ''), raceMs: toMs(schedule.race) } } : state;
  } catch {
    return null;
  }
}
