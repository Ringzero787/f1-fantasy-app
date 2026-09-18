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
  const excludeTeamId = typeof data?.excludeTeamId === 'string' ? data.excludeTeamId : null;
  // limit(2): one match may be the caller's own team being renamed.
  const snap = await db.collection('fantasyTeams').where('name', '==', name).limit(2).get();
  return { available: !isTakenBy(snap.docs.map((d) => d.id), excludeTeamId) };
});
