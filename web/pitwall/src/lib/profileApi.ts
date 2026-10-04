/**
 * Names the person can change from the portal (F-100): the team's name, through the server so the
 * app's rules (2–30 characters, unique) are the ones that decide, and their own display name, which
 * goes to the Auth profile and the users document the app reads on its next load.
 */
import { updateProfile } from 'firebase/auth';
import { auth, callable, firestore } from './firebase';

export const NAME_MIN = 2;
export const NAME_MAX = 30;

/** Trimmed, single-spaced, or null when outside the bounds. */
export function normalizeName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name.length < NAME_MIN || name.length > NAME_MAX ? null : name;
}

export async function renameTeam(teamId: string, name: string): Promise<string> {
  const fn = await callable<{ teamId: string; name: string }, { name: string }>('renameTeam');
  const res = await fn({ teamId, name });
  return res.data.name;
}

export async function renameUser(name: string): Promise<void> {
  const user = auth().currentUser;
  if (!user) throw new Error('Not signed in');
  const { m, db } = await firestore();
  await m.updateDoc(m.doc(db, 'users', user.uid), { displayName: name, updatedAt: m.serverTimestamp() });
  await updateProfile(user, { displayName: name });
}

/** A readable error for the two things the server refuses. */
export function renameErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code.endsWith('already-exists')) return 'That team name is taken.';
  if (code.endsWith('invalid-argument')) return `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  if (code.endsWith('permission-denied')) return 'That is not your team.';
  return (e as Error)?.message || 'Could not save the name.';
}
