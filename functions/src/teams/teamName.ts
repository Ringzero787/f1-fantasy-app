/**
 * Team-name availability (F-059). Released clients answered "is this name
 * taken?" with a global `where('name','==',…)` query on fantasyTeams, which is
 * why any signed-in user could read any team. The check now runs here with the
 * Admin SDK, so the client-facing list rule can be scoped to a user's own and
 * same-league teams.
 */
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';

const db = admin.firestore();

export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 30;

/** Trimmed name, or null when it is not an acceptable team name. */
export function normalizeTeamName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (name.length < TEAM_NAME_MIN || name.length > TEAM_NAME_MAX) return null;
  return name;
}

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;
/** Trimmed display name, or null when it is not acceptable (same bounds the app's Profile applies). */
export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) return null;
  return name;
}

/** Same rule the clients applied: an exact-name match on any team other than `excludeTeamId` means taken. */
export function isTakenBy(matchIds: string[], excludeTeamId?: string | null): boolean {
  return matchIds.some((id) => id !== excludeTeamId);
}

export const checkTeamNameAvailable = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'checkTeamNameAvailable');
  const name = normalizeTeamName(data?.name);
  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', `Team name must be ${TEAM_NAME_MIN}–${TEAM_NAME_MAX} characters`);
  }
  // excludeTeamId is for renaming your OWN team to a name it already holds; it is
  // honoured only when that team belongs to the caller.
  let excludeTeamId: string | null = null;
  if (typeof data?.excludeTeamId === 'string' && data.excludeTeamId && !data.excludeTeamId.includes('/')) {
    const own = await db.doc(`fantasyTeams/${data.excludeTeamId}`).get();
    if (own.exists && own.data()?.userId === context.auth.uid) excludeTeamId = own.id;
  }
  // limit(2): one match may be the caller's own team being renamed.
  const snap = await db.collection('fantasyTeams').where('name', '==', name).limit(2).get();
  return { available: !isTakenBy(snap.docs.map((d) => d.id), excludeTeamId) };
});

/**
 * Rename the caller's own team (F-100). The portal has no direct write to fantasyTeams, so the
 * rename runs here with the same rules the app applies on the client: trimmed, 2–30 characters,
 * and no other team holding the name. Returns the saved name.
 */
export const renameTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  warnIfNoAppCheck(context, 'renameTeam');
  const name = normalizeTeamName(data?.name);
  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', `Team name must be ${TEAM_NAME_MIN}–${TEAM_NAME_MAX} characters`);
  }
  const teamId = typeof data?.teamId === 'string' && data.teamId && !data.teamId.includes('/') ? data.teamId : null;
  if (!teamId) throw new functions.https.HttpsError('invalid-argument', 'teamId is required');
  const ref = db.doc(`fantasyTeams/${teamId}`);
  const own = await ref.get();
  if (!own.exists || own.data()?.userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Not your team');
  }
  const snap = await db.collection('fantasyTeams').where('name', '==', name).limit(2).get();
  if (isTakenBy(snap.docs.map((d) => d.id), teamId)) {
    throw new functions.https.HttpsError('already-exists', 'That team name is taken');
  }
  await ref.update({ name, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  return { name };
});
