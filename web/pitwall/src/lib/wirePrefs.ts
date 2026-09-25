/**
 * Where a reader's wire history lives (F-071): one private document, `users/{uid}/pitwall/wire`,
 * two maps and a stamp. The rules let only the owner read or write it, and refuse any other key,
 * so this cannot become a place to park arbitrary data. Reads and writes fail quietly: losing a
 * read mark is a small thing, and the page must keep working offline.
 */
import { firestore } from './firebase';
import { EMPTY_PREFS, toPrefs, type WirePrefs } from '../data/wire';

export async function loadWirePrefs(uid: string): Promise<WirePrefs> {
  try {
    const { m, db } = await firestore();
    const snap = await m.getDoc(m.doc(db, 'users', uid, 'pitwall', 'wire'));
    return snap.exists() ? toPrefs(snap.data()) : EMPTY_PREFS;
  } catch {
    return EMPTY_PREFS;
  }
}

/** Whole-document write: the two maps are small and the last writer wins, which is fine for one reader. */
export async function saveWirePrefs(uid: string, prefs: WirePrefs): Promise<void> {
  try {
    const { m, db } = await firestore();
    await m.setDoc(m.doc(db, 'users', uid, 'pitwall', 'wire'), { read: prefs.read, liked: prefs.liked, updatedAt: Date.now() });
  } catch {
    // a lost mark is not worth an error in the reader's face
  }
}
