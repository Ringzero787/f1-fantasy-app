/** The written outlook for one driver and round (F-071); null when none is published or the rules refuse it (pass only). */
import { firestore } from './firebase';

export interface Outlook { text: string; model: string; generatedAt: string; builtFrom: string[] }
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export async function loadOutlook(season: string, round: number, entityId: string): Promise<Outlook | null> {
  try {
    const { m, db } = await firestore();
    const snap = await m.getDoc(m.doc(db, 'pw_entities', `${season}_${round}_${entityId}`));
    if (!snap.exists()) return null;
    const o = ((snap.data() as Record<string, unknown>).outlook ?? {}) as Record<string, unknown>;
    if (!str(o.text)) return null;
    return { text: str(o.text), model: str(o.model), generatedAt: str(o.generatedAt), builtFrom: Array.isArray(o.builtFrom) ? o.builtFrom.filter((x): x is string => typeof x === 'string') : [] };
  } catch {
    return null;
  }
}
