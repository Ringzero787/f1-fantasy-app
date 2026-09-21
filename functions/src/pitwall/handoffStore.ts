/** Firestore side of the handoff: every decision is made inside a transaction. */
import { checkRedeem, hashHandoffCode, newHandoffCode, newHandoffDoc, nextRateWindow, type HandoffDoc } from './handoffCore';

type Db = FirebaseFirestore.Firestore;

/** @returns false when `key` is over its limit. */
export async function takeRateSlot(db: Db, key: string, now: number, limit: { windowMs: number; max: number }): Promise<boolean> {
  const ref = db.collection('pw_handoff_limits').doc(key);
  return db.runTransaction(async (tx) => {
    const next = nextRateWindow((await tx.get(ref)).data(), now, limit.windowMs, limit.max);
    if (!next) return false;
    tx.set(ref, { ...next, updatedAt: now });
    return true;
  });
}

export async function createHandoff(db: Db, uid: string, src: string | null, now: number): Promise<string> {
  const code = newHandoffCode();
  await db.collection('pw_handoffs').doc(hashHandoffCode(code)).create({ ...newHandoffDoc(uid, src, now) });
  return code;
}

/** Marks the code used and returns its uid, or null if it is missing, used or expired. Two racing redeems: one wins. */
export async function redeemHandoff(db: Db, code: string, now: number): Promise<string | null> {
  const ref = db.collection('pw_handoffs').doc(hashHandoffCode(code));
  return db.runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data() as Partial<HandoffDoc> | undefined;
    if (checkRedeem(doc, now) !== 'ok') return null;
    tx.update(ref, { used: true, usedAt: now });
    return doc!.uid as string;
  });
}

/** Codes are useless after a minute; rows older than a day are removed. */
export async function deleteOldHandoffs(db: Db, now: number): Promise<number> {
  let deleted = 0;
  for (const col of ['pw_handoffs', 'pw_handoff_limits']) {
    const field = col === 'pw_handoffs' ? 'createdAt' : 'updatedAt';
    for (;;) {
      const page = await db.collection(col).where(field, '<', now - 24 * 3600 * 1000).limit(300).get();
      if (page.empty) break;
      const batch = db.batch(); page.docs.forEach((d) => batch.delete(d.ref)); await batch.commit();
      deleted += page.size;
    }
  }
  return deleted;
}
