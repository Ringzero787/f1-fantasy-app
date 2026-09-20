/**
 * Writes the per-race league leaderboard and syncs race wins (F-062).
 * Firestore side of leagueRaceResults.ts; called by calculatePoints Phase 4.
 */
import * as admin from 'firebase-admin';
import { rankRaceEntries, countRaceWins, raceWinWrites, type StoredRaceResult } from './leagueRaceResults';
import { snapshotWeekendPoints } from './raceSnapshots';

/** Names come from client-written documents: keep them short, single-line strings in a server-owned document. */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60);
  return s.length > 0 ? s : undefined;
}

interface RaceMeta {
  raceId: string;
  season: string | number | null | undefined;
  round: number | null | undefined;
  name?: string | null;
}

/**
 * @param leagueTeams the league's team docs (already read by Phase 4)
 * @param members the league's member docs (already read by Phase 4)
 * @param racePhasePointsByUser fallback for teams with no snapshot (scored before F-029 deployed mid-weekend)
 */
export async function writeLeagueRaceResult(
  db: FirebaseFirestore.Firestore,
  leagueId: string,
  race: RaceMeta,
  leagueTeams: FirebaseFirestore.QueryDocumentSnapshot[],
  members: FirebaseFirestore.QueryDocumentSnapshot[],
  racePhasePointsByUser: Map<string, number>,
): Promise<void> {
  const season = race.season == null ? null : String(race.season);
  const snapRefs = leagueTeams.map((t) => t.ref.collection('raceSnapshots').doc(race.raceId));
  const snaps = snapRefs.length > 0 ? await db.getAll(...snapRefs) : [];

  const pointsByUser = new Map<string, number>();
  const teamNameByUser = new Map<string, string>();
  const usersWithSnapshot = new Set<string>();
  leagueTeams.forEach((teamDoc, i) => {
    const team = teamDoc.data();
    const userId = team.userId as string | undefined;
    if (!userId) return;
    if (typeof team.name === 'string' && !teamNameByUser.has(userId)) teamNameByUser.set(userId, team.name);
    const snap = snaps[i];
    if (snap && snap.exists) {
      usersWithSnapshot.add(userId);
      pointsByUser.set(userId, (pointsByUser.get(userId) ?? 0) + snapshotWeekendPoints(snap.data() as never));
    }
  });
  for (const [userId, pts] of racePhasePointsByUser) {
    if (!usersWithSnapshot.has(userId)) pointsByUser.set(userId, (pointsByUser.get(userId) ?? 0) + pts);
  }

  // Only approved members appear; a member with no team this weekend scores 0.
  const approved = members.filter((m) => m.data().status !== 'pending');
  const result = rankRaceEntries(approved.map((m) => ({
    userId: m.id,
    points: pointsByUser.get(m.id) ?? 0,
    displayName: cleanName(m.data().displayName),
    teamName: cleanName(teamNameByUser.get(m.id)),
  })));

  const leagueRef = db.collection('leagues').doc(leagueId);
  // One atomic commit: the result, and its id on the league doc the app already reads
  // (the selector lists only races that have a leaderboard).
  const batch = db.batch();
  batch.set(leagueRef, { raceResultIds: admin.firestore.FieldValue.arrayUnion(race.raceId) }, { merge: true });
  batch.set(leagueRef.collection('raceResults').doc(race.raceId), {
    raceId: race.raceId,
    season,
    round: typeof race.round === 'number' ? race.round : null,
    raceName: race.name ?? null,
    entries: result.entries,
    winners: result.winners,
    topPoints: result.topPoints,
    estimated: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();

  await syncRaceWins(db, leagueId, season, members);
}

/** SET every member's raceWins from the stored results of `season` (idempotent). */
export async function syncRaceWins(
  db: FirebaseFirestore.Firestore,
  leagueId: string,
  season: string | null,
  members: FirebaseFirestore.QueryDocumentSnapshot[],
): Promise<number> {
  const leagueRef = db.collection('leagues').doc(leagueId);
  const resultsSnap = await leagueRef.collection('raceResults').get();
  const wins = countRaceWins(resultsSnap.docs.map((d) => d.data() as StoredRaceResult), season);
  const current = new Map<string, number | undefined>(members.map((m) => [m.id, m.data().raceWins as number | undefined]));
  const writes = raceWinWrites(members.map((m) => m.id), wins, current);
  if (writes.length === 0) return 0;
  const batch = db.batch();
  for (const w of writes) batch.set(leagueRef.collection('members').doc(w.id), { raceWins: w.raceWins }, { merge: true });
  await batch.commit();
  return writes.length;
}
