// F-163. Admin stats aggregator for Undercut. Writes admin/projects/undercut/stats and a daily
// history_YYYY-MM-DD snapshot, the shared contract the humannpc admin App Stats page reads
// (QuiltWall and QuestLog write the same shape in their own projects). Runs daily, and on demand
// from the admin page's Refresh through the getAdminStats callable (admin claim required).
//
// Read-only over player data: it counts and reads timestamps, and writes only under admin/.
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { buildUndercutStats, DAY_MS, LastSeen, UsageCount, UserRow, toMillis, utcDay } from './statsCore';

const db = admin.firestore();

async function count(q: FirebaseFirestore.Query): Promise<number> {
  return (await q.count().get()).data().count;
}

/** today = created in the last 24h, all = every doc. */
async function usage(col: string, since: admin.firestore.Timestamp): Promise<UsageCount> {
  const q = db.collection(col);
  const [today, all] = await Promise.all([count(q.where('createdAt', '>=', since)), count(q)]);
  return { today, all };
}

/** Auth last-seen per uid: the later of last sign-in and last token refresh. */
async function readLastSeen(): Promise<LastSeen> {
  const seen: LastSeen = new Map();
  let pageToken: string | undefined;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const t = Math.max(toMillis(u.metadata.lastSignInTime), toMillis(u.metadata.lastRefreshTime ?? null));
      if (t) seen.set(u.uid, t);
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return seen;
}

export async function runUndercutStats(now = Date.now()) {
  const since = admin.firestore.Timestamp.fromMillis(now - DAY_MS);

  const [usersSnap, lastSeen, teams, leagues, racesCompleted, moonshots, teamsCreated, leaguesCreated, moonshotUse, purchases, errSnap] =
    await Promise.all([
      db.collection('users').select('createdAt', 'pass').get(),
      readLastSeen(),
      count(db.collection('fantasyTeams')),
      count(db.collection('leagues')),
      count(db.collection('races').where('status', '==', 'completed')),
      count(db.collection('moonshots')),
      usage('fantasyTeams', since),
      usage('leagues', since),
      usage('moonshots', since),
      // Every purchases doc is written by validatePurchase after a store verified it; filtering on
      // status as well would need a (status, createdAt) composite index.
      usage('purchases', since),
      // Undercut and Track Limits share errorLogs; Track Limits stamps app: 'tracklimits'.
      db.collection('errorLogs').where('createdAt', '>=', since).select('app').get(),
    ]);

  const users: UserRow[] = usersSnap.docs.map((d) => ({ uid: d.id, createdAt: d.get('createdAt'), pass: d.get('pass') }));
  const errors24h = errSnap.docs.filter((d) => d.get('app') !== 'tracklimits').length;

  const stats = buildUndercutStats({
    now,
    users,
    lastSeen,
    content: { teams, leagues, racesCompleted, moonshots },
    usage: { teamsCreated, leaguesCreated, moonshots: moonshotUse, purchases },
    errors24h,
  });

  const col = db.doc('admin/projects').collection('undercut');
  await Promise.all([
    col.doc('stats').set(stats),
    col.doc(`history_${utcDay(now)}`).set(stats),
  ]);
  return stats;
}

export const aggregateAdminStats = onSchedule(
  { schedule: 'every day 06:00', timeZone: 'America/Chicago', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    const s = await runUndercutStats();
    console.log(`aggregateAdminStats: ${s.totalUsers} users, ${s.activeUsersDay} DAU`);
  },
);

export const getAdminStats = onCall({ memory: '512MiB', timeoutSeconds: 300 }, async (request) => {
  if (request.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Admin only');
  return runUndercutStats();
});
