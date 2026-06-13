import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { warnIfNoAppCheck } from '../utils/appCheck';
import { rebuildMarketCache } from '../cache/marketCache';
import {
  RACE_POINTS,
  SPRINT_POINTS,
  SPRINT_DNF_PENALTY,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS,
  GRID_SIZE,
  ACE_MAX_PRICE,
  calculateLockBonus,
  calculateQualifyingPoints,
  calculateDriverPoints,
  RaceResult,
  SprintResult,
  QualifyingResult,
} from './scoringCore';

const db = admin.firestore();

// Price tier thresholds
const TIER_A_THRESHOLD = 240;
const TIER_B_THRESHOLD = 120;

// PPM thresholds for pricing
const PPM_GREAT = 0.06;
const PPM_GOOD = 0.04;
const PPM_POOR = 0.02;

const PRICE_CHANGES = {
  A_TIER: { great: 36, good: 12, poor: -12, terrible: -36 },
  B_TIER: { great: 24, good: 7, poor: -7, terrible: -24 },
  C_TIER: { great: 12, good: 5, poor: -5, terrible: -12 },
};

const MIN_PRICE = 5;
const MAX_PRICE = 700;
const DIMINISH_FLOOR = 400;
const DIMINISH_MIN_FACTOR = 0.25;

const DNF_PRICE_PENALTY_MAX = 24;
const DNF_PRICE_PENALTY_MIN = 2;

// Contract system
const CONTRACT_LENGTH_DEFAULT = 3;
const CONTRACT_LOCKOUT_RACES = 1;
const TEAM_SIZE = 5;

// Firestore batch limit
const BATCH_OP_LIMIT = 499;

interface FantasyDriver {
  driverId: string;
  name: string;
  shortName: string;
  constructorId: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  purchasedAtRaceId?: string;
  contractLength?: number;
  isReservePick?: boolean;
  addedAtRace?: number;
}

interface FantasyConstructor {
  constructorId: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  contractLength?: number;
  isReservePick?: boolean;
  addedAtRace?: number;
}

interface FantasyTeam {
  userId: string;
  leagueId: string;
  drivers: FantasyDriver[];
  constructor: FantasyConstructor | null;
  totalPoints: number;
  budget: number;
  isLocked: boolean;
  lockStatus: {
    isSeasonLocked: boolean;
    canModify: boolean;
    lockReason?: string;
    nextUnlockTime?: FirebaseFirestore.Timestamp;
    [key: string]: unknown;
  };
  aceDriverId?: string;
  aceConstructorId?: string;
  lastTransferRaceId?: string;
  racesSinceTransfer: number;
  driverLockouts?: Record<string, number>;
  lockedPoints?: number;
  totalSpent?: number;
  scoredRaces?: string[];
}

type PerformanceTier = 'great' | 'good' | 'poor' | 'terrible';

/**
 * Safely read a team's fantasy constructor.
 *
 * `team.constructor` (and equally `team['constructor']`) on a doc with NO
 * constructor field returns Object.prototype.constructor — a truthy function —
 * which then flows NaN into scoring math. Validate the shape before trusting it.
 */
function getTeamCtor(team: Record<string, any>): FantasyConstructor | null {
  const c = Object.prototype.hasOwnProperty.call(team, 'constructor') ? team['constructor'] : null;
  if (c && typeof c === 'object' && !Array.isArray(c) && typeof c.constructorId === 'string') {
    return c as FantasyConstructor;
  }
  return null;
}

// ─── Helper functions ───
// Pure scoring math (constants, calculateLockBonus, calculateQualifyingPoints,
// calculateDriverPoints, result types) now lives in ./scoringCore and is imported
// above, so the live pipeline and the diagnostic share one source of truth.

function getPerformanceTier(ppm: number): PerformanceTier {
  if (ppm >= PPM_GREAT) return 'great';
  if (ppm >= PPM_GOOD) return 'good';
  if (ppm >= PPM_POOR) return 'poor';
  return 'terrible';
}

function applyDiminishingReturns(change: number, currentPrice: number): number {
  if (change <= 0) return change;
  if (currentPrice <= DIMINISH_FLOOR) return change;
  const progress = Math.min(1, (currentPrice - DIMINISH_FLOOR) / (MAX_PRICE - DIMINISH_FLOOR));
  const factor = 1 - progress * (1 - DIMINISH_MIN_FACTOR);
  return Math.round(change * factor);
}

function calculatePriceChange(points: number, currentPrice: number): number {
  const ppm = currentPrice === 0 ? 0 : points / currentPrice;
  const performanceTier = getPerformanceTier(ppm);
  const priceChangeMap = currentPrice > TIER_A_THRESHOLD
    ? PRICE_CHANGES.A_TIER
    : currentPrice > TIER_B_THRESHOLD
      ? PRICE_CHANGES.B_TIER
      : PRICE_CHANGES.C_TIER;
  const rawChange = priceChangeMap[performanceTier];
  return applyDiminishingReturns(rawChange, currentPrice);
}

function calculateDnfPricePenalty(dnfLap: number, totalLaps: number): number {
  if (totalLaps <= 1) return DNF_PRICE_PENALTY_MIN;
  if (dnfLap <= 0) return DNF_PRICE_PENALTY_MAX;
  if (dnfLap >= totalLaps) return DNF_PRICE_PENALTY_MIN;
  const progress = (dnfLap - 1) / (totalLaps - 1);
  const penalty = DNF_PRICE_PENALTY_MIN +
    (DNF_PRICE_PENALTY_MAX - DNF_PRICE_PENALTY_MIN) * (1 - progress);
  return Math.ceil(penalty);
}

/**
 * Commit writes in batches respecting the 500-op Firestore limit.
 */
/**
 * Recursively sanitize data before writing to Firestore.
 * Replaces NaN with 0 and undefined with null to prevent Firestore write failures.
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (typeof obj === 'number' && isNaN(obj)) {
    // Last-resort guard. If this ever fires, an upstream calculation produced
    // NaN (e.g. a malformed result row) — writing 0 here can CLOBBER a stored
    // total, so treat any occurrence as a data bug to investigate immediately.
    console.error('[sanitize] DATA BUG: replaced NaN with 0 in Firestore write — upstream calculation produced NaN');
    return 0;
  }
  if (obj === null || typeof obj !== 'object') return obj;
  // Preserve FieldValue sentinels (increment, arrayUnion, serverTimestamp, etc.)
  if (obj.constructor && obj.constructor.name !== 'Object' && !Array.isArray(obj)) return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeForFirestore(value);
  }
  return result;
}

async function commitInBatches(
  ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }>
): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_OP_LIMIT) {
    const batch = db.batch();
    const chunk = ops.slice(i, i + BATCH_OP_LIMIT);
    for (const op of chunk) {
      batch.set(op.ref, sanitizeForFirestore(op.data), { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Deterministic league ranking: totalPoints desc, lastRacePoints desc, then
 * member id asc as a stable final tiebreak. Firestore orderBy alone leaves
 * tied members in arbitrary (doc-id-internal) order, so ranks of tied players
 * could swap between scoring events.
 */
async function rankLeagueMembers(leagueId: string): Promise<void> {
  const membersSnap = await db.collection('leagues').doc(leagueId).collection('members').get();
  const sorted = [...membersSnap.docs].sort((a, b) => {
    const ad = a.data();
    const bd = b.data();
    const byTotal = (bd.totalPoints || 0) - (ad.totalPoints || 0);
    if (byTotal !== 0) return byTotal;
    const byLastRace = (bd.lastRacePoints || 0) - (ad.lastRacePoints || 0);
    if (byLastRace !== 0) return byLastRace;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const rankOps = sorted.map((d, index) => ({ ref: d.ref, data: { rank: index + 1 } }));
  await commitInBatches(rankOps);
}

// ─── Qualifying scoring (standalone) ───

/**
 * Score qualifying results independently of race completion.
 * Awards quarter-rate position bonus via calculateQualifyingPoints (top 16 only).
 * Runs on every weekend, including sprint weekends.
 */
export async function handleQualifyingScoring(
  raceId: string,
  raceData: FirebaseFirestore.DocumentData,
): Promise<null> {
  const qualifyingResults: QualifyingResult[] = raceData.results?.qualifyingResults;
  if (!qualifyingResults || qualifyingResults.length === 0) {
    console.log(`[Qualifying] No qualifying results for ${raceId}`);
    return null;
  }

  console.log(`[Qualifying] Scoring qualifying for ${raceId} (${qualifyingResults.length} drivers)`);

  const qualifyingResultsMap = new Map<string, QualifyingResult>();
  qualifyingResults.forEach((r) => qualifyingResultsMap.set(r.driverId, r));

  // Pre-fetch driver/constructor prices for ace validation
  const [driverPriceSnap, ctorPriceSnap] = await Promise.all([
    db.collection('drivers').get(),
    db.collection('constructors').get(),
  ]);
  const driverPriceMap = new Map<string, number>();
  driverPriceSnap.docs.forEach((d) => driverPriceMap.set(d.id, d.data().price || 0));
  const ctorPriceMap = new Map<string, number>();
  ctorPriceSnap.docs.forEach((d) => ctorPriceMap.set(d.id, d.data().price || 0));

  const qualiScoredKey = `quali_${raceId}`;
  const teamsSnapshot = await db.collection('fantasyTeams').get();
  const pointsUpdates: { leagueId: string; userId: string; points: number }[] = [];

  for (const teamDoc of teamsSnapshot.docs) {
    const team = teamDoc.data() as FantasyTeam;

    // Idempotency guard: skip teams already scored for this qualifying
    if (team.scoredRaces && team.scoredRaces.includes(qualiScoredKey)) {
      console.log(`[Qualifying] Skipping team ${teamDoc.id} — already scored for ${qualiScoredKey}`);
      continue;
    }

    // Half-created shell teams can have drivers === undefined; iterating it
    // threw "Cannot read properties of undefined (reading 'map')" and aborted
    // the ENTIRE scoring run (this is what silently dropped monaco_2026). Skip
    // teams with no roster — they have nothing to score.
    if (!Array.isArray(team.drivers)) {
      console.log(`[Qualifying] Skipping team ${teamDoc.id} — no drivers array (empty/half-created)`);
      continue;
    }

    let teamPoints = 0;
    const aceDriverId = team.aceDriverId;

    // Score driver qualifying points
    const updatedDrivers = team.drivers.map((driver) => {
      let isAce = driver.driverId === aceDriverId;
      if (isAce) {
        const price = driverPriceMap.get(driver.driverId) || 0;
        if (price > ACE_MAX_PRICE) isAce = false;
      }

      const qualiResult = qualifyingResultsMap.get(driver.driverId);
      let qualiPoints = qualiResult ? calculateQualifyingPoints(qualiResult.position) : 0;
      if (isAce) qualiPoints *= 2;

      teamPoints += qualiPoints;
      return {
        ...driver,
        pointsScored: (driver.pointsScored || 0) + qualiPoints,
      };
    });

    // Score constructor qualifying points
    const teamCtor = getTeamCtor(team as Record<string, any>);
    let updatedConstructor = teamCtor;
    if (teamCtor) {
      const ctor = teamCtor;
      let isAceConstructor = team.aceConstructorId === ctor.constructorId;
      if (isAceConstructor) {
        const price = ctorPriceMap.get(ctor.constructorId) || 0;
        if (price > ACE_MAX_PRICE) isAceConstructor = false;
      }

      let ctorQualiPoints = 0;
      const ctorQualiResults = qualifyingResults.filter(
        (r) => r.constructorId === ctor.constructorId,
      );
      for (const qr of ctorQualiResults) {
        ctorQualiPoints += calculateQualifyingPoints(qr.position);
      }
      if (isAceConstructor) ctorQualiPoints *= 2;

      teamPoints += ctorQualiPoints;
      updatedConstructor = {
        ...ctor,
        pointsScored: (ctor.pointsScored || 0) + ctorQualiPoints,
      };
    }

    if (teamPoints !== 0) {
      const updateData: Record<string, any> = {
        drivers: updatedDrivers,
        // increment() instead of snapshot + add: the snapshot may be minutes
        // stale by write time, so a concurrent writer's points would be lost.
        totalPoints: admin.firestore.FieldValue.increment(teamPoints),
        scoredRaces: admin.firestore.FieldValue.arrayUnion(qualiScoredKey),
      };
      if (updatedConstructor) {
        updateData['constructor'] = updatedConstructor;
      }

      try {
        await teamDoc.ref.set(updateData, { merge: true });
      } catch (err) {
        console.error(`[Qualifying] Failed to update team ${teamDoc.id}:`, err);
        continue;
      }

      pointsUpdates.push({
        leagueId: team.leagueId,
        userId: team.userId,
        points: teamPoints,
      });
    }
  }

  console.log(`[Qualifying] Scored ${pointsUpdates.length} teams for ${raceId}`);

  // Sync league member totalPoints from team docs (authoritative source)
  const affectedLeagues = [...new Set(pointsUpdates.map((u) => u.leagueId).filter(Boolean))];
  for (const leagueId of affectedLeagues) {
    const leagueTeamsSnap = await db.collection('fantasyTeams').where('leagueId', '==', leagueId).get();
    const teamPtsByUser = new Map<string, number>();
    leagueTeamsSnap.docs.forEach(d => {
      const t = d.data();
      const pts = (t.totalPoints || 0) + (t.lockedPoints || 0);
      teamPtsByUser.set(t.userId, (teamPtsByUser.get(t.userId) || 0) + pts);
    });
    const membersSnap = await db.collection('leagues').doc(leagueId).collection('members').get();
    const memberOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    membersSnap.docs.forEach(d => {
      const pts = teamPtsByUser.get(d.id);
      if (pts !== undefined) memberOps.push({ ref: d.ref, data: { totalPoints: pts } });
    });
    await commitInBatches(memberOps);
    await rankLeagueMembers(leagueId);
  }

  console.log(`[Qualifying] Updated rankings for ${affectedLeagues.length} leagues`);
  return null;
}

// ─── Sprint scoring (standalone, scored after sprint ends on Saturday) ───

/**
 * Score sprint results independently before the main race.
 * Awards sprint points: [5, 4, 3, 3, 2, 2, 1, 1] for top 8.
 * DNF/DSQ: -3 points. Ace 2x applies.
 */
export async function handleSprintScoring(
  raceId: string,
  sprintResults: SprintResult[],
): Promise<null> {
  if (!sprintResults || sprintResults.length === 0) {
    console.log(`[Sprint] No sprint results for ${raceId}`);
    return null;
  }

  console.log(`[Sprint] Scoring sprint for ${raceId} (${sprintResults.length} drivers)`);

  const sprintResultsMap = new Map<string, SprintResult>();
  sprintResults.forEach((r) => sprintResultsMap.set(r.driverId, r));

  // Pre-fetch driver prices for ace validation
  const driverPriceSnap = await db.collection('drivers').get();
  const driverPriceMap = new Map<string, number>();
  driverPriceSnap.docs.forEach((d) => driverPriceMap.set(d.id, d.data().price || 0));

  const sprintScoredKey = `sprint_${raceId}`;
  const teamsSnapshot = await db.collection('fantasyTeams').get();
  const pointsUpdates: { leagueId: string; userId: string; points: number }[] = [];

  for (const teamDoc of teamsSnapshot.docs) {
    const team = teamDoc.data() as FantasyTeam;

    // Idempotency guard
    if (team.scoredRaces && team.scoredRaces.includes(sprintScoredKey)) {
      console.log(`[Sprint] Skipping team ${teamDoc.id} — already scored for ${sprintScoredKey}`);
      continue;
    }

    // Skip shell teams with no roster (drivers === undefined) — see the
    // qualifying handler note; an unguarded map() here aborted the whole run.
    if (!Array.isArray(team.drivers)) {
      console.log(`[Sprint] Skipping team ${teamDoc.id} — no drivers array (empty/half-created)`);
      continue;
    }

    let teamPoints = 0;
    const aceDriverId = team.aceDriverId;

    // Score each driver's sprint result
    const updatedDrivers = team.drivers.map((driver) => {
      let isAce = driver.driverId === aceDriverId;
      if (isAce) {
        const price = driverPriceMap.get(driver.driverId) || 0;
        if (price > ACE_MAX_PRICE) isAce = false;
      }

      const sr = sprintResultsMap.get(driver.driverId);
      let sprintPts = 0;
      if (sr) {
        if (sr.status === 'finished'
            && sr.position >= 1 && sr.position <= SPRINT_POINTS.length) {
          sprintPts = SPRINT_POINTS[sr.position - 1];
        } else if (sr.status === 'dnf' || sr.status === 'dsq') {
          sprintPts = SPRINT_DNF_PENALTY;
        }
      }
      if (isAce) sprintPts *= 2;

      teamPoints += sprintPts;
      return {
        ...driver,
        pointsScored: (driver.pointsScored || 0) + sprintPts,
      };
    });

    if (teamPoints !== 0) {
      const updateData: Record<string, any> = {
        drivers: updatedDrivers,
        // increment() — see qualifying handler note on stale snapshots.
        totalPoints: admin.firestore.FieldValue.increment(teamPoints),
        scoredRaces: admin.firestore.FieldValue.arrayUnion(sprintScoredKey),
      };

      try {
        await teamDoc.ref.set(updateData, { merge: true });
      } catch (err) {
        console.error(`[Sprint] Failed to update team ${teamDoc.id}:`, err);
        continue;
      }

      pointsUpdates.push({
        leagueId: team.leagueId,
        userId: team.userId,
        points: teamPoints,
      });
    }
  }

  console.log(`[Sprint] Scored ${pointsUpdates.length} teams for ${raceId}`);

  // Sync league member totalPoints from team docs (authoritative source)
  const affectedLeagues = [...new Set(pointsUpdates.map((u) => u.leagueId).filter(Boolean))];
  for (const leagueId of affectedLeagues) {
    const leagueTeamsSnap = await db.collection('fantasyTeams').where('leagueId', '==', leagueId).get();
    const teamPtsByUser = new Map<string, number>();
    leagueTeamsSnap.docs.forEach(d => {
      const t = d.data();
      const pts = (t.totalPoints || 0) + (t.lockedPoints || 0);
      teamPtsByUser.set(t.userId, (teamPtsByUser.get(t.userId) || 0) + pts);
    });
    const membersSnap = await db.collection('leagues').doc(leagueId).collection('members').get();
    const memberOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    membersSnap.docs.forEach(d => {
      const pts = teamPtsByUser.get(d.id);
      if (pts !== undefined) memberOps.push({ ref: d.ref, data: { totalPoints: pts } });
    });
    await commitInBatches(memberOps);
    await rankLeagueMembers(leagueId);
  }

  console.log(`[Sprint] Updated rankings for ${affectedLeagues.length} leagues`);
  return null;
}

// ─── Main trigger ───

/**
 * Single trigger fired when a race transitions to 'completed'.
 * Performs all 5 phases:
 *   1. Score fantasy teams
 *   2. Update driver/constructor market prices
 *   3. Update currentPrices in fantasy team docs + recalc budgets
 *   4. Update league rankings
 *   5. Unlock non-season-locked teams
 */
export const onRaceCompleted = functions
  .runWith({ timeoutSeconds: 540 })
  .firestore.document('races/{raceId}')
  .onUpdate(async (change, context) => {
    const raceId = context.params.raceId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // NOTE: standalone qualifying scoring is NOT handled here. checkQualifyingResults
    // calls handleQualifyingScoring() directly after setting qualifyingScored=true.
    // This trigger previously ALSO fired on that flag transition, so two concurrent
    // executions raced the non-transactional scoredRaces guard and double-scored
    // qualifying for whichever teams the second run snapshotted before the first
    // run's writes landed. The direct call is the single intended path.

    // Only process when race just completed
    if (beforeData.status === 'completed' || afterData.status !== 'completed') {
      return null;
    }

    const results = afterData.results;
    if (!results || !results.raceResults) {
      console.log('No race results found');
      return null;
    }

    const raceResults: RaceResult[] = results.raceResults;
    const sprintResults: SprintResult[] | null = results.sprintResults || null;
    const qualifyingResults: QualifyingResult[] | null = results.qualifyingResults || null;

    // Skip qualifying if already scored independently (via checkQualifyingResults)
    const qualifyingAlreadyScored = afterData.qualifyingScored === true && beforeData.qualifyingScored === true;
    const scoreQualifying = !qualifyingAlreadyScored
      && !!qualifyingResults && qualifyingResults.length > 0;

    // Build lookup maps
    const raceResultsMap = new Map<string, RaceResult>();
    raceResults.forEach((r) => raceResultsMap.set(r.driverId, r));

    const sprintResultsMap = new Map<string, SprintResult>();
    if (sprintResults) {
      sprintResults.forEach((r) => sprintResultsMap.set(r.driverId, r));
    }

    // Always build the quali map so the per-driver raceScores breakdown (Phase 0.5)
    // reflects qualifying points even when qualifying was already scored standalone
    // on Saturday. Team scoring (Phase 1) still gates quali on `scoreQualifying` to
    // avoid double-counting — only the breakdown display reads the map unconditionally.
    const qualifyingResultsMap = new Map<string, QualifyingResult>();
    if (qualifyingResults) {
      qualifyingResults.forEach((r) => qualifyingResultsMap.set(r.driverId, r));
    }

    // Pre-fetch all driver and constructor prices for ace validation
    const driverPriceSnap = await db.collection('drivers').get();
    const driverPriceMap = new Map<string, number>();
    driverPriceSnap.docs.forEach((d) => driverPriceMap.set(d.id, d.data().price || 0));

    const ctorPriceSnap = await db.collection('constructors').get();
    const ctorPriceMap = new Map<string, number>();
    ctorPriceSnap.docs.forEach((d) => ctorPriceMap.set(d.id, d.data().price || 0));

    // ─── PHASE 0.5: Write per-driver/constructor race scores ───
    console.log(`[Phase 0.5] Writing race scores for ${raceId}`);
    const raceScoreOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const result of raceResults) {
      const sprintResult = sprintResultsMap.get(result.driverId) || null;
      const qualiResult = qualifyingResultsMap.get(result.driverId);

      let racePoints = 0;
      let sprintPoints = 0;
      let qualiPoints = 0;
      let positionsGained = 0;
      let fastestLapBonus = 0;

      if (result.status === 'finished') {
        if (result.position >= 1 && result.position <= RACE_POINTS.length) racePoints += RACE_POINTS[result.position - 1];
        positionsGained = result.gridPosition - result.position;
        if (positionsGained > 0) racePoints += positionsGained * POSITION_GAINED_BONUS;
        if (positionsGained < 0) racePoints += positionsGained;
        if (result.fastestLap && result.position <= 10) {
          racePoints += FASTEST_LAP_BONUS;
          fastestLapBonus = FASTEST_LAP_BONUS;
        }
        if (result.position >= 1 && result.position <= GRID_SIZE) {
          racePoints += GRID_SIZE + 1 - result.position;
        }
      } else if (result.status === 'dnf' || result.status === 'dsq') {
        racePoints = -5;
      }

      if (sprintResult) {
        if (sprintResult.status === 'finished'
            && sprintResult.position >= 1 && sprintResult.position <= SPRINT_POINTS.length) {
          sprintPoints = SPRINT_POINTS[sprintResult.position - 1];
        } else if (sprintResult.status === 'dnf' || sprintResult.status === 'dsq') {
          sprintPoints = SPRINT_DNF_PENALTY;
        }
      }

      // Breakdown always reflects qualifying (scored Saturday or at race time) so the
      // per-driver "last race points" reconcile with the team total.
      if (qualiResult) {
        qualiPoints = calculateQualifyingPoints(qualiResult.position);
      }

      const docId = `${raceId}__${result.driverId}`;
      raceScoreOps.push({
        ref: db.collection('raceScores').doc(docId),
        data: {
          raceId,
          round: afterData.round || 0,
          entityId: result.driverId,
          entityType: 'driver',
          constructorId: result.constructorId,
          position: result.position,
          gridPosition: result.gridPosition,
          status: result.status,
          positionsGained,
          racePoints,
          sprintPoints,
          sprintPosition: sprintResult?.position ?? null,
          qualiPoints,
          qualiPosition: qualiResult?.position ?? null,
          fastestLap: result.fastestLap,
          fastestLapBonus,
          totalPoints: racePoints + sprintPoints + qualiPoints,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }

    // Constructor race scores (aggregate of both drivers)
    const constructorIds = [...new Set(raceResults.map(r => r.constructorId))];
    for (const ctorId of constructorIds) {
      const ctorDriverResults = raceResults.filter(r => r.constructorId === ctorId);
      let ctorRacePoints = 0;
      let ctorQualiPoints = 0;
      let ctorSprintPoints = 0;

      for (const result of ctorDriverResults) {
        if (result.status === 'finished') {
          if (result.position >= 1 && result.position <= RACE_POINTS.length) ctorRacePoints += RACE_POINTS[result.position - 1];
          if (result.position >= 1 && result.position <= GRID_SIZE) ctorRacePoints += GRID_SIZE + 1 - result.position;
        }
        // Constructors do not earn sprint points (matches team scoring + spec);
        // ctorSprintPoints stays 0 so the breakdown shows no phantom sprint points.
        const qr = qualifyingResultsMap.get(result.driverId);
        if (qr) {
          ctorQualiPoints += calculateQualifyingPoints(qr.position);
        }
      }

      const docId = `${raceId}__${ctorId}`;
      raceScoreOps.push({
        ref: db.collection('raceScores').doc(docId),
        data: {
          raceId,
          round: afterData.round || 0,
          entityId: ctorId,
          entityType: 'constructor',
          racePoints: ctorRacePoints,
          sprintPoints: ctorSprintPoints,
          qualiPoints: ctorQualiPoints,
          totalPoints: ctorRacePoints + ctorSprintPoints + ctorQualiPoints,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }

    await commitInBatches(raceScoreOps);
    console.log(`[Phase 0.5] Wrote ${raceScoreOps.length} race scores`);

    // Neutral per-entity point components (race/sprint/quali, no ace/lock/stale)
    // from the breakdown, used for the Phase 1 reconciliation guard below.
    const neutralByEntity = new Map<string, { racePoints: number; sprintPoints: number; qualiPoints: number }>();
    for (const op of raceScoreOps) {
      neutralByEntity.set(op.data.entityId, {
        racePoints: op.data.racePoints || 0,
        sprintPoints: op.data.sprintPoints || 0,
        qualiPoints: op.data.qualiPoints || 0,
      });
    }

    // ─── PHASE 1: Score fantasy teams ───
    console.log(`[Phase 1] Scoring teams for race ${raceId}`);

    const teamsSnapshot = await db.collection('fantasyTeams').get();
    const teamOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    const pointsUpdates: { leagueId: string; userId: string; points: number }[] = [];
    // Double-entry guard: each team's scored points, re-derived independently from
    // the neutral breakdown, must equal the team-scored points. A mismatch means the
    // breakdown (Phase 0.5) and team scoring (Phase 1) have diverged — the exact bug
    // class that hid qualifying points from players.
    const reconMismatches: Array<{ teamId: string; expected: number; got: number }> = [];

    for (const teamDoc of teamsSnapshot.docs) {
      const team = teamDoc.data() as FantasyTeam;

      // Idempotency guard: skip teams already scored for this race
      if (team.scoredRaces && team.scoredRaces.includes(raceId)) {
        console.log(`[Phase 1] Skipping team ${teamDoc.id} — already scored for ${raceId}`);
        continue;
      }

      // Shell teams with no roster (drivers === undefined) crashed the
      // `for (const driver of team.drivers)` below with "team.drivers is not
      // iterable", aborting Phase 1 for EVERY team and leaving the race
      // unscored (root cause of monaco_2026 never scoring). Skip them.
      if (!Array.isArray(team.drivers)) {
        console.log(`[Phase 1] Skipping team ${teamDoc.id} — no drivers array (empty/half-created)`);
        continue;
      }

      let teamPoints = 0;
      let reconTeamPoints = 0;
      const aceDriverId = team.aceDriverId;

      // Skip sprint in race scoring if already scored independently
      const sprintAlreadyScored = team.scoredRaces?.includes(`sprint_${raceId}`) ?? false;

      // Calculate driver points
      const updatedDrivers: FantasyDriver[] = [];
      for (const driver of team.drivers) {
        const raceResult = raceResultsMap.get(driver.driverId);
        const sprintResult = sprintAlreadyScored ? null : (sprintResultsMap.get(driver.driverId) || null);
        let isAce = driver.driverId === aceDriverId;

        // Server-side ace price validation: drivers over $200 cannot be ace
        if (isAce) {
          const driverPrice = driverPriceMap.get(driver.driverId) || 0;
          if (driverPrice > ACE_MAX_PRICE) {
            console.warn(`Invalid ace: driver ${driver.driverId} price $${driverPrice} > $${ACE_MAX_PRICE}`);
            isAce = false;
          }
        }

        let driverPoints = 0;
        if (raceResult) {
          driverPoints = calculateDriverPoints(raceResult, sprintResult, driver.racesHeld, isAce);
        }

        // Qualifying points (quarter-rate bonus, all weekends) — only when quali
        // wasn't already scored standalone on Saturday (scoreQualifying gate).
        if (scoreQualifying) {
          const qualiResult = qualifyingResultsMap.get(driver.driverId);
          if (qualiResult) {
            let qualiPoints = calculateQualifyingPoints(qualiResult.position);
            if (isAce) qualiPoints *= 2;
            driverPoints += qualiPoints;
          }
        }

        teamPoints += driverPoints;

        // Re-derive the same points from the neutral breakdown, mirroring the gates
        // above (sprint excluded if already scored Saturday; quali only when scored
        // at race time; ace doubles base, lock bonus added after).
        const dn = neutralByEntity.get(driver.driverId);
        if (dn) {
          const base = dn.racePoints
            + (sprintAlreadyScored ? 0 : dn.sprintPoints)
            + (scoreQualifying ? dn.qualiPoints : 0);
          reconTeamPoints += base * (isAce ? 2 : 1) + calculateLockBonus(driver.racesHeld);
        }

        updatedDrivers.push({
          ...driver,
          pointsScored: (driver.pointsScored || 0) + driverPoints,
          racesHeld: (driver.racesHeld || 0) + 1,
        });
      }

      // Calculate constructor points
      let updatedConstructor: FantasyConstructor | null = null;
      const phase1Ctor = getTeamCtor(team as Record<string, any>);
      if (phase1Ctor) {
        const ctor = phase1Ctor;
        let isAceConstructor = team.aceConstructorId === ctor.constructorId;

        // Server-side ace constructor price validation: constructors over $200 cannot be ace
        if (isAceConstructor) {
          const ctorPrice = ctorPriceMap.get(ctor.constructorId) || 0;
          if (ctorPrice > ACE_MAX_PRICE) {
            console.warn(`Invalid ace constructor: ${ctor.constructorId} price $${ctorPrice} > $${ACE_MAX_PRICE}`);
            isAceConstructor = false;
          }
        }

        let constructorPoints = 0;

        const constructorDriverResults = raceResults.filter(
          (r) => r.constructorId === ctor.constructorId
        );
        for (const result of constructorDriverResults) {
          if (result.status === 'finished') {
            if (result.position >= 1 && result.position <= RACE_POINTS.length) {
              constructorPoints += RACE_POINTS[result.position - 1];
            }
            // Position bonus for each constructor driver
            if (result.position >= 1 && result.position <= GRID_SIZE) {
              constructorPoints += GRID_SIZE + 1 - result.position;
            }
          }
        }
        // Qualifying points for constructor: sum both drivers' half-rate qualifying bonus
        if (scoreQualifying && qualifyingResults) {
          const ctorQualiResults = qualifyingResults.filter(
            (r) => r.constructorId === ctor.constructorId
          );
          for (const qr of ctorQualiResults) {
            constructorPoints += calculateQualifyingPoints(qr.position);
          }
        }

        if (isAceConstructor) {
          constructorPoints *= 2;
        }
        // Lock bonus is loyalty-based and is NOT doubled by ace (per scoring spec).
        constructorPoints += calculateLockBonus(ctor.racesHeld);

        teamPoints += constructorPoints;

        // Re-derive constructor points from the neutral breakdown (no sprint for
        // constructors; quali only when scored at race time).
        const cn = neutralByEntity.get(ctor.constructorId);
        if (cn) {
          const base = cn.racePoints + (scoreQualifying ? cn.qualiPoints : 0);
          reconTeamPoints += base * (isAceConstructor ? 2 : 1) + calculateLockBonus(ctor.racesHeld);
        }

        updatedConstructor = {
          ...ctor,
          pointsScored: (ctor.pointsScored || 0) + constructorPoints,
          racesHeld: (ctor.racesHeld || 0) + 1,
        };
      }

      // Stale roster penalty
      const racesSinceTransfer = team.racesSinceTransfer || 0;
      if (racesSinceTransfer > 5) {
        const stalePenalty = (racesSinceTransfer - 5) * 5;
        teamPoints -= stalePenalty;
        reconTeamPoints -= stalePenalty;
      }

      if (reconTeamPoints !== teamPoints) {
        reconMismatches.push({ teamId: teamDoc.id, expected: reconTeamPoints, got: teamPoints });
      }

      teamOps.push({
        ref: teamDoc.ref,
        data: {
          drivers: updatedDrivers,
          constructor: updatedConstructor,
          // increment() — the collection snapshot may be minutes stale by the
          // time batches commit; snapshot+add would drop concurrent updates.
          totalPoints: admin.firestore.FieldValue.increment(teamPoints),
          racesSinceTransfer: admin.firestore.FieldValue.increment(1),
          scoredRaces: admin.firestore.FieldValue.arrayUnion(raceId),
        },
      });

      pointsUpdates.push({
        leagueId: team.leagueId,
        userId: team.userId,
        points: teamPoints,
      });
    }

    await commitInBatches(teamOps);
    console.log(`[Phase 1] Scored ${teamsSnapshot.size} teams`);

    // Reconciliation guard: breakdown must match team scoring.
    if (reconMismatches.length > 0) {
      console.error(`[Phase 1][RECONCILE] ${reconMismatches.length} team(s) failed breakdown reconciliation — ` +
        `the raceScores breakdown does not match team scoring (the two paths have diverged):`);
      for (const m of reconMismatches.slice(0, 20)) {
        console.error(`[Phase 1][RECONCILE]   team ${m.teamId}: breakdown-derived=${m.expected} vs team-scored=${m.got}`);
      }
    } else {
      console.log(`[Phase 1][RECONCILE] OK — all ${teamOps.length} scored teams reconcile with the raceScores breakdown`);
    }

    // ─── Idempotency gate for the market phases (2, 3, 3.5) ───
    // Team scoring (Phase 1) is per-team idempotent via scoredRaces, but the
    // market phases are not per-entity guarded: re-running them (manual recalc
    // via calculatePointsManually, or at-least-once trigger redelivery) used to
    // compound price changes, double-count season fantasyPoints, and re-run
    // contract expiry. Claim a per-race stamp transactionally; for races priced
    // before the stamp existed, fall back to detecting their priceHistory rows.
    // If a run crashes after claiming the stamp, prices stay un-applied (admin
    // can clear `pricesApplied` on the race doc and recalc) — strictly better
    // than the old failure mode of applying them twice.
    const raceRef = change.after.ref;
    let runMarketPhases = await db.runTransaction(async (tx) => {
      const snap = await tx.get(raceRef);
      if (snap.data()?.pricesApplied === true) return false;
      tx.update(raceRef, { pricesApplied: true });
      return true;
    });
    if (runMarketPhases) {
      const priorHistory = await db.collection('priceHistory')
        .where('raceId', '==', raceId).limit(1).get();
      if (!priorHistory.empty) {
        console.log(`[Phase 2] Market phases already applied for ${raceId} (pre-stamp priceHistory found) — skipping`);
        runMarketPhases = false;
      }
    }

    if (!runMarketPhases) {
      console.log(`[Phase 2/3/3.5] Skipped — prices already applied for ${raceId}`);
    } else {
    // NOTE: the phase 2/3/3.5 bodies below intentionally keep their original
    // indentation level to keep this gating change reviewable as a small diff.

    // ─── PHASE 2: Update market prices ───
    console.log(`[Phase 2] Updating market prices`);

    // Pricing-specific points calculation (uses different point values from scoring)
    const PRICING_RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    const PRICING_SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];

    const driverPricingPoints = new Map<string, number>();
    const constructorPricingPoints = new Map<string, number>();
    const driverDnfPenalties = new Map<string, number>();
    const constructorDnfPenalties = new Map<string, number>();

    let totalLaps = afterData.totalLaps || 0;
    if (!totalLaps) {
      for (const result of raceResults) {
        if (result.status === 'finished' && (result.laps || 0) > totalLaps) {
          totalLaps = result.laps || 0;
        }
      }
    }

    for (const result of raceResults) {
      let points = 0;
      if (result.status === 'finished') {
        if (result.position >= 1 && result.position <= PRICING_RACE_POINTS.length) {
          points = PRICING_RACE_POINTS[result.position - 1];
        }
        const positionsGained = result.gridPosition - result.position;
        if (positionsGained > 0) points += positionsGained;
        if (result.fastestLap && result.position <= 10) points += 1;
        // Position bonus for pricing
        if (result.position >= 1 && result.position <= GRID_SIZE) {
          points += GRID_SIZE + 1 - result.position;
        }
      } else if (result.status === 'dnf' && totalLaps > 0) {
        const dnfLap = result.laps || 1;
        const dnfPenalty = calculateDnfPricePenalty(dnfLap, totalLaps);
        driverDnfPenalties.set(result.driverId, dnfPenalty);
        const existing = constructorDnfPenalties.get(result.constructorId) || 0;
        constructorDnfPenalties.set(result.constructorId, existing + dnfPenalty);
      }

      driverPricingPoints.set(result.driverId, (driverPricingPoints.get(result.driverId) || 0) + points);
      constructorPricingPoints.set(
        result.constructorId,
        (constructorPricingPoints.get(result.constructorId) || 0) + points
      );
    }

    if (sprintResults) {
      for (const result of sprintResults) {
        if (result.status === 'finished'
            && result.position >= 1 && result.position <= PRICING_SPRINT_POINTS.length) {
          const points = PRICING_SPRINT_POINTS[result.position - 1];
          driverPricingPoints.set(result.driverId, (driverPricingPoints.get(result.driverId) || 0) + points);
        }
      }
    }

    // Entities that actually took part in the race: drivers with a non-DNS
    // result row, and their constructors. Drivers absent from the results
    // (injury, mid-season replacement) and DNS drivers must NOT be re-priced —
    // previously they were treated as scoring 0 → 'terrible' tier → bled
    // -12/-24/-36 per race without turning a wheel.
    const participatingDrivers = new Set<string>();
    const participatingCtors = new Set<string>();
    for (const result of raceResults) {
      if (result.status === 'dns') continue;
      participatingDrivers.add(result.driverId);
      participatingCtors.add(result.constructorId);
    }

    // Update driver prices
    // Reuse pre-fetched driver data, filter to active only
    const driversSnapshot = { docs: driverPriceSnap.docs.filter(d => d.data().isActive === true), size: 0 };
    driversSnapshot.size = driversSnapshot.docs.length;
    const driverPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    const priceHistoryOps: Array<{ id: string; data: Record<string, any> }> = [];

    for (const driverDoc of driversSnapshot.docs) {
      const driver = driverDoc.data();
      if (!participatingDrivers.has(driverDoc.id)) continue;
      const points = driverPricingPoints.get(driverDoc.id) || 0;
      // Defensive: a missing/NaN stored price would otherwise propagate NaN.
      const basePrice = typeof driver.price === 'number' && !isNaN(driver.price)
        ? driver.price : MIN_PRICE;
      const performanceChange = calculatePriceChange(points, basePrice);
      const dnfPenalty = driverDnfPenalties.get(driverDoc.id) || 0;
      const totalPriceChange = performanceChange - dnfPenalty;
      const newPrice = Math.min(MAX_PRICE, Math.max(MIN_PRICE, basePrice + totalPriceChange));
      // History records the change actually applied (post-clamp) so
      // previousPrice + change === price always holds for charting.
      const appliedChange = newPrice - basePrice;

      driverPriceOps.push({
        ref: driverDoc.ref,
        data: {
          previousPrice: basePrice,
          price: newPrice,
          fantasyPoints: admin.firestore.FieldValue.increment(points),
          tier: newPrice > TIER_A_THRESHOLD ? 'A' : newPrice > TIER_B_THRESHOLD ? 'B' : 'C',
        },
      });

      priceHistoryOps.push({
        // Deterministic id: re-runs overwrite instead of appending duplicates.
        id: `${raceId}__${driverDoc.id}`,
        data: {
          entityId: driverDoc.id,
          entityType: 'driver',
          price: newPrice,
          previousPrice: basePrice,
          change: appliedChange,
          performanceChange,
          dnfPenalty,
          points,
          raceId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }

    await commitInBatches(driverPriceOps);

    // Update constructor prices
    const constructorsSnapshot = { docs: ctorPriceSnap.docs.filter(d => d.data().isActive === true), size: 0 };
    constructorsSnapshot.size = constructorsSnapshot.docs.length;
    const ctorPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const ctorDoc of constructorsSnapshot.docs) {
      const ctor = ctorDoc.data();
      if (!participatingCtors.has(ctorDoc.id)) continue;
      const points = constructorPricingPoints.get(ctorDoc.id) || 0;
      const basePrice = typeof ctor.price === 'number' && !isNaN(ctor.price)
        ? ctor.price : MIN_PRICE;
      const performanceChange = calculatePriceChange(points, basePrice);
      const dnfPenalty = constructorDnfPenalties.get(ctorDoc.id) || 0;
      const totalPriceChange = performanceChange - dnfPenalty;
      const newPrice = Math.min(MAX_PRICE, Math.max(MIN_PRICE, basePrice + totalPriceChange));
      const appliedChange = newPrice - basePrice;

      ctorPriceOps.push({
        ref: ctorDoc.ref,
        data: {
          previousPrice: basePrice,
          price: newPrice,
          fantasyPoints: admin.firestore.FieldValue.increment(points),
          tier: newPrice > TIER_A_THRESHOLD ? 'A' : newPrice > TIER_B_THRESHOLD ? 'B' : 'C',
        },
      });

      priceHistoryOps.push({
        id: `${raceId}__${ctorDoc.id}`,
        data: {
          entityId: ctorDoc.id,
          entityType: 'constructor',
          price: newPrice,
          previousPrice: basePrice,
          change: appliedChange,
          performanceChange,
          dnfPenalty,
          points,
          raceId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        },
      });
    }

    await commitInBatches(ctorPriceOps);

    // Batch write price history (deterministic ids — idempotent on re-run)
    for (let i = 0; i < priceHistoryOps.length; i += BATCH_OP_LIMIT) {
      const batch = db.batch();
      const chunk = priceHistoryOps.slice(i, i + BATCH_OP_LIMIT);
      for (const op of chunk) {
        batch.set(db.collection('priceHistory').doc(op.id), op.data);
      }
      await batch.commit();
    }

    console.log(`[Phase 2] Updated ${driversSnapshot.size} driver + ${constructorsSnapshot.size} constructor prices`);

    // Rebuild market cache after price updates (non-blocking)
    rebuildMarketCache().catch((e) => console.warn('Market cache rebuild failed:', e));

    // ─── PHASE 3: Update currentPrices in fantasy teams + recalc budgets ───
    console.log(`[Phase 3] Refreshing team currentPrices`);

    // Build updated price maps from Phase 2 results (no re-query needed)
    const driverPrices = new Map<string, number>();
    for (const op of driverPriceOps) {
      driverPrices.set(op.ref.id, op.data.price);
    }
    // Include inactive drivers that weren't in driverPriceOps
    driverPriceSnap.docs.forEach((d) => {
      if (!driverPrices.has(d.id)) driverPrices.set(d.id, d.data().price || 0);
    });

    const ctorPrices = new Map<string, number>();
    for (const op of ctorPriceOps) {
      ctorPrices.set(op.ref.id, op.data.price);
    }
    ctorPriceSnap.docs.forEach((d) => {
      if (!ctorPrices.has(d.id)) ctorPrices.set(d.id, d.data().price || 0);
    });

    // Re-read teams (they were updated in phase 1)
    const freshTeamsSnap = await db.collection('fantasyTeams').get();
    const teamPriceOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const teamDoc of freshTeamsSnap.docs) {
      const team = teamDoc.data() as Record<string, unknown>;
      const drivers = (team.drivers || []) as FantasyDriver[];
      const teamCtor = getTeamCtor(team as Record<string, any>);

      const updatedDrivers = drivers.map((driver) => ({
        ...driver,
        currentPrice: driverPrices.get(driver.driverId) || driver.currentPrice,
      }));

      let updatedConstructor = teamCtor;
      if (teamCtor) {
        updatedConstructor = {
          ...teamCtor,
          currentPrice: ctorPrices.get(teamCtor.constructorId) || teamCtor.currentPrice,
        };
      }

      // Budget is intentionally NOT touched here. It is a cash ledger owned by
      // the roster callables (addDriverSecure/removeDriverSecure/etc.) and by
      // Phase 3.5's expiry sale-proceeds/auto-fill accounting. The old formula
      // (1000 - totalSpent + unrealized value change) recomputed budget from a
      // totalSpent that nothing maintained, resetting every team to ~$1000 of
      // spendable cash each race and double-counting unrealized gains.
      teamPriceOps.push({
        ref: teamDoc.ref,
        data: {
          drivers: updatedDrivers,
          constructor: updatedConstructor,
        },
      });
    }

    await commitInBatches(teamPriceOps);
    console.log(`[Phase 3] Updated prices for ${freshTeamsSnap.size} teams`);

    // ─── PHASE 3.5: Contract expiry + auto-fill ───
    console.log(`[Phase 3.5] Processing contract expiry and auto-fill`);

    const completedRacesSnap = await db.collection('races').where('status', '==', 'completed').get();
    const completedRaceCount = completedRacesSnap.size;

    // Reuse freshTeamsSnap from Phase 3 (no re-query needed)
    const contractOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    // Reuse pre-fetched snapshots with updated prices from Phase 2
    const allDriversList: Array<{ id: string; name: string; shortName: string; constructorId: string; price: number }> = [];
    for (const d of driverPriceSnap.docs) {
      const data = d.data();
      if (!data.isActive) continue;
      allDriversList.push({
        id: d.id,
        name: data.name || '',
        shortName: data.shortName || '',
        constructorId: data.constructorId || '',
        price: driverPrices.get(d.id) || data.price || 0,
      });
    }
    allDriversList.sort((a, b) => a.price - b.price);

    const allCtorsList: Array<{ id: string; name: string; price: number }> = [];
    for (const c of ctorPriceSnap.docs) {
      const data = c.data();
      if (!data.isActive) continue;
      allCtorsList.push({ id: c.id, name: data.name || '', price: ctorPrices.get(c.id) || data.price || 0 });
    }
    allCtorsList.sort((a, b) => a.price - b.price);

    let totalExpiredDrivers = 0;
    let totalExpiredConstructors = 0;
    let totalAutoFilled = 0;

    for (const teamDoc of freshTeamsSnap.docs) {
      const team = teamDoc.data() as FantasyTeam & Record<string, unknown>;
      let drivers = [...(team.drivers || [])] as FantasyDriver[];
      let teamCtor = getTeamCtor(team as Record<string, any>);
      let budget = (team.budget as number) ?? 0;
      let aceDriverId = team.aceDriverId;
      let aceConstructorId = team.aceConstructorId;
      let lockedPoints = team.lockedPoints || 0;
      // Points banked THIS pass (newly-expired entities). These must be subtracted
      // from totalPoints — they move into lockedPoints, and the leaderboard/client
      // display totalPoints + lockedPoints, so leaving them in both double-counts.
      let newlyBanked = 0;
      const lockouts: Record<string, number> = { ...(team.driverLockouts || {}) };

      let saleReturns = 0;
      let autoFillCosts = 0;
      const expiredDriverIds: string[] = [];
      let constructorExpired = false;

      // (a) Driver contract expiry
      const remainingDrivers: FantasyDriver[] = [];
      for (const driver of drivers) {
        const contractLen = driver.contractLength || CONTRACT_LENGTH_DEFAULT;
        if (driver.racesHeld >= contractLen) {
          // Expired: sell at current price, bank points, add lockout
          saleReturns += driver.currentPrice; // SALE_COMMISSION_RATE is 0
          lockedPoints += driver.pointsScored;
          newlyBanked += driver.pointsScored;
          lockouts[driver.driverId] = completedRaceCount + CONTRACT_LOCKOUT_RACES;
          expiredDriverIds.push(driver.driverId);
          if (aceDriverId === driver.driverId) aceDriverId = undefined;
          totalExpiredDrivers++;
        } else {
          remainingDrivers.push(driver);
        }
      }
      drivers = remainingDrivers;

      // (b) Constructor contract expiry
      let expiredConstructorId: string | undefined;
      if (teamCtor) {
        const cContractLen = teamCtor.contractLength || CONTRACT_LENGTH_DEFAULT;
        if (teamCtor.racesHeld >= cContractLen) {
          saleReturns += teamCtor.currentPrice;
          lockedPoints += teamCtor.pointsScored;
          newlyBanked += teamCtor.pointsScored;
          expiredConstructorId = teamCtor.constructorId;
          if (aceConstructorId === teamCtor.constructorId) aceConstructorId = undefined;
          teamCtor = null;
          constructorExpired = true;
          totalExpiredConstructors++;
        }
      }

      // Skip if nothing expired
      if (expiredDriverIds.length === 0 && !constructorExpired) {
        // Still prune expired lockouts even if no new expirations
        let lockoutsChanged = false;
        for (const [dId, expiresAt] of Object.entries(lockouts)) {
          if (completedRaceCount >= expiresAt) {
            delete lockouts[dId];
            lockoutsChanged = true;
          }
        }
        if (lockoutsChanged) {
          contractOps.push({
            ref: teamDoc.ref,
            data: {
              driverLockouts: Object.keys(lockouts).length > 0 ? lockouts : admin.firestore.FieldValue.delete(),
            },
          });
        }
        continue;
      }

      // (c) Prune expired lockouts
      for (const [dId, expiresAt] of Object.entries(lockouts)) {
        if (completedRaceCount >= expiresAt) {
          delete lockouts[dId];
        }
      }

      // (d) Auto-fill drivers (only if drivers expired this pass)
      if (expiredDriverIds.length > 0) {
        const teamDriverIds = new Set(drivers.map(d => d.driverId));
        const expiredSet = new Set(expiredDriverIds);
        let fillBudget = budget + saleReturns - autoFillCosts;

        for (const candidate of allDriversList) {
          if (drivers.length >= TEAM_SIZE) break;
          if (candidate.price > fillBudget) break;
          if (teamDriverIds.has(candidate.id)) continue;
          if (expiredSet.has(candidate.id)) continue;
          // Check lockout
          const lockExpiry = lockouts[candidate.id];
          if (lockExpiry !== undefined && completedRaceCount < lockExpiry) continue;

          drivers.push({
            driverId: candidate.id,
            name: candidate.name,
            shortName: candidate.shortName,
            constructorId: candidate.constructorId,
            purchasePrice: candidate.price,
            currentPrice: candidate.price,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: CONTRACT_LENGTH_DEFAULT,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          });
          teamDriverIds.add(candidate.id);
          autoFillCosts += candidate.price;
          fillBudget -= candidate.price;
          totalAutoFilled++;
        }
      }

      // (e) Auto-fill constructor (only if constructor expired this pass)
      if (constructorExpired) {
        let fillBudget = budget + saleReturns - autoFillCosts;
        for (const candidate of allCtorsList) {
          if (candidate.price > fillBudget) break;
          if (candidate.id === expiredConstructorId) continue;

          teamCtor = {
            constructorId: candidate.id,
            name: candidate.name,
            purchasePrice: candidate.price,
            currentPrice: candidate.price,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: CONTRACT_LENGTH_DEFAULT,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          };
          autoFillCosts += candidate.price;
          totalAutoFilled++;
          break;
        }
      }

      // (f) Budget = original budget + sale returns - auto-fill costs
      const newBudget = budget + saleReturns - autoFillCosts;

      // (g) Ace auto-clear if price > $200
      if (aceDriverId) {
        const aceDriver = drivers.find(d => d.driverId === aceDriverId);
        if (aceDriver && aceDriver.currentPrice > ACE_MAX_PRICE) {
          aceDriverId = undefined;
        }
      }
      if (aceConstructorId && teamCtor) {
        if (teamCtor.currentPrice > ACE_MAX_PRICE) {
          aceConstructorId = undefined;
        }
      }

      contractOps.push({
        ref: teamDoc.ref,
        data: {
          drivers,
          constructor: teamCtor,
          budget: Math.round(newBudget),
          aceDriverId: aceDriverId ?? admin.firestore.FieldValue.delete(),
          aceConstructorId: aceConstructorId ?? admin.firestore.FieldValue.delete(),
          driverLockouts: Object.keys(lockouts).length > 0 ? lockouts : admin.firestore.FieldValue.delete(),
          lockedPoints: lockedPoints > 0 ? lockedPoints : admin.firestore.FieldValue.delete(),
          // Remove newly-banked points from totalPoints so totalPoints stays =
          // active-roster points only (no overlap with lockedPoints).
          totalPoints: admin.firestore.FieldValue.increment(-newlyBanked),
        },
      });
    }

    await commitInBatches(contractOps);
    console.log(`[Phase 3.5] Expired ${totalExpiredDrivers} drivers, ${totalExpiredConstructors} constructors, auto-filled ${totalAutoFilled} slots`);
    } // end market phases (2, 3, 3.5) idempotency gate

    // ─── PHASE 4: Update league rankings ───
    // Re-read all teams to get authoritative totalPoints (includes quali, sprint, race)
    // and SET league member totalPoints (not increment) to prevent drift.
    console.log(`[Phase 4] Syncing league member points from team totals`);

    const affectedLeagues = [...new Set(pointsUpdates.map((u) => u.leagueId).filter(Boolean))];

    for (const leagueId of affectedLeagues) {
      // Get all teams in this league
      const leagueTeamsSnap = await db
        .collection('fantasyTeams')
        .where('leagueId', '==', leagueId)
        .get();

      // This race's points per user: sum each team's entry exactly once.
      // (The old find()-per-team approach returned the FIRST matching entry for
      // every team a user owned, double-counting lastRacePoints for two-team users.)
      const lastRaceByUser = new Map<string, number>();
      for (const u of pointsUpdates) {
        if (u.leagueId !== leagueId) continue;
        lastRaceByUser.set(u.userId, (lastRaceByUser.get(u.userId) || 0) + u.points);
      }

      // Build userId → totalPoints from authoritative team docs
      const teamPointsByUser = new Map<string, { totalPoints: number; lastRacePoints: number }>();
      for (const teamDoc of leagueTeamsSnap.docs) {
        const team = teamDoc.data();
        const userId = team.userId;
        const teamTotal = (team.totalPoints || 0) + (team.lockedPoints || 0);

        // If user has multiple teams in same league, sum team totals;
        // lastRacePoints comes from the per-user map (already summed).
        const existing = teamPointsByUser.get(userId);
        if (existing) {
          teamPointsByUser.set(userId, {
            totalPoints: existing.totalPoints + teamTotal,
            lastRacePoints: lastRaceByUser.get(userId) ?? 0,
          });
        } else {
          teamPointsByUser.set(userId, {
            totalPoints: teamTotal,
            lastRacePoints: lastRaceByUser.get(userId) ?? 0,
          });
        }
      }

      // SET league member totalPoints from team data (authoritative, no drift)
      const membersSnapshot = await db
        .collection('leagues')
        .doc(leagueId)
        .collection('members')
        .get();

      const memberOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
      for (const memberDoc of membersSnapshot.docs) {
        const userId = memberDoc.id;
        const teamData = teamPointsByUser.get(userId);

        if (teamData) {
          memberOps.push({
            ref: memberDoc.ref,
            data: {
              totalPoints: teamData.totalPoints,
              lastRacePoints: teamData.lastRacePoints,
              lastRaceId: raceId,
            },
          });
        }
      }

      await commitInBatches(memberOps);

      // Recalculate rankings (deterministic, with tiebreaks)
      await rankLeagueMembers(leagueId);
    }

    console.log(`[Phase 4] Synced rankings for ${affectedLeagues.length} leagues`);

    // ─── PHASE 5: Schedule delayed unlock (3 hours after race completion) ───
    const UNLOCK_DELAY_MS = 3 * 60 * 60 * 1000; // 3 hours
    const unlockTime = admin.firestore.Timestamp.fromMillis(Date.now() + UNLOCK_DELAY_MS);
    console.log(`[Phase 5] Scheduling team unlock for ${unlockTime.toDate().toISOString()}`);

    const lockedTeamsSnap = await db
      .collection('fantasyTeams')
      .where('isLocked', '==', true)
      .get();

    const unlockOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];

    for (const teamDoc of lockedTeamsSnap.docs) {
      const team = teamDoc.data();
      if (team.lockStatus?.isSeasonLocked) continue;

      unlockOps.push({
        ref: teamDoc.ref,
        data: {
          'lockStatus.nextUnlockTime': unlockTime,
          'lockStatus.lockReason': 'Results processed — unlocking soon',
        },
      });
    }

    await commitInBatches(unlockOps);
    console.log(`[Phase 5] Scheduled unlock for ${unlockOps.length} teams`);

    console.log(`Race ${raceId} fully processed: scored, priced, ranked, unlocked`);
    return null;
  });

/**
 * HTTP function to manually trigger points calculation
 */
export const calculatePointsManually = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }
  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
  warnIfNoAppCheck(context, 'calculatePointsManually');

  const { raceId } = data;
  if (!raceId) {
    throw new functions.https.HttpsError('invalid-argument', 'raceId is required');
  }

  const raceDoc = await db.collection('races').doc(raceId).get();
  if (!raceDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Race not found');
  }

  const raceData = raceDoc.data();
  if (!raceData?.results) {
    throw new functions.https.HttpsError('failed-precondition', 'Race has no results');
  }

  // Toggle status to re-trigger the onUpdate
  await raceDoc.ref.update({ status: 'in_progress' });
  await raceDoc.ref.update({ status: 'completed' });

  return { success: true, message: 'Points calculation triggered' };
});

/**
 * Repair function: recalculates team scoring.
 *
 * Two modes:
 *  • FULL rebuild (default, no fromRound): recomputes every team's total from
 *    scratch over all completed races, re-applies contract expiry/auto-fill, and
 *    rewrites lockouts. Use this to fix corruption — note it WILL shift standings
 *    if scoring rules changed since races were originally scored.
 *  • INCREMENTAL (fromRound set): preserves the stored total and all rounds
 *    < fromRound exactly as-is, and only scores races with round >= fromRound that
 *    are not already in the team's scoredRaces, adding them on top with the current
 *    (corrected) logic. Roster, lockouts, and lockedPoints are left untouched. Use
 *    this to apply a scoring fix "going forward only" without disturbing history.
 *    Incremental mode never rescores an already-scored race; to correct one, run a
 *    full rebuild.
 *
 * Params: { dryRun?: boolean, fromRound?: number }
 * Admin-only, callable. Invoke from admin panel or Firebase console.
 */
export const repairTeamScoring = functions
  .runWith({ timeoutSeconds: 300, memory: '512MB' })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    if (!context.auth.token.admin) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const dryRun = data?.dryRun === true;

    // Optional round cutoff: when set, run in incremental mode (preserve history
    // before fromRound, only score not-yet-scored races from fromRound onward).
    let fromRound: number | null = null;
    if (data?.fromRound !== undefined && data?.fromRound !== null) {
      fromRound = Number(data.fromRound);
      if (!Number.isInteger(fromRound) || fromRound < 1) {
        throw new functions.https.HttpsError('invalid-argument', 'fromRound must be a positive integer');
      }
    }
    const incremental = fromRound !== null;

    if (!incremental) {
      // Full rebuild is mathematically unsound with the data we store and has
      // corrupted totals before (the "repairTeamScoring landmine"):
      //  • it replays every completed race against the CURRENT roster, ignoring
      //    addedAtRace / purchase history — a driver bought last week is
      //    retroactively scored for the whole season;
      //  • it drops qualifying for races where quali was scored as part of race
      //    completion (the qualifyingScored flag is only set by standalone
      //    Saturday scoring, so those races fail the flag check here);
      //  • it drops stale-roster penalties while resetting the baseline to 0;
      //  • it validates ace via purchasePrice while live scoring uses the
      //    market price at scoring time.
      // Until per-race roster history exists, only incremental mode is allowed.
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Full rebuild is disabled (known-unsound — see code comment). Pass fromRound to run incremental mode.'
      );
    }

    console.log(`[Repair] Starting team scoring repair (dryRun=${dryRun}, mode=incremental from round ${fromRound})`);

    // ─── Load all completed races ───
    const racesSnap = await db.collection('races')
      .where('status', '==', 'completed')
      .get();

    if (racesSnap.empty) {
      return { success: true, message: 'No completed races found', teamsFixed: 0 };
    }

    // Sort by round locally to avoid needing a composite index
    const sortedRaceDocs = racesSnap.docs.sort(
      (a, b) => (a.data().round || 0) - (b.data().round || 0)
    );

    const completedRaces: Array<{
      raceId: string;
      round: number;
      hasSprint: boolean;
      qualifyingScored: boolean;
      raceResults: RaceResult[];
      sprintResults: SprintResult[] | null;
      qualifyingResults: QualifyingResult[] | null;
      fastestLap: string | null;
    }> = [];

    for (const raceDoc of sortedRaceDocs) {
      const rd = raceDoc.data();
      completedRaces.push({
        raceId: raceDoc.id,
        round: rd.round,
        hasSprint: rd.hasSprint === true,
        qualifyingScored: rd.qualifyingScored === true,
        raceResults: rd.results?.raceResults || [],
        sprintResults: rd.results?.sprintResults || null,
        qualifyingResults: rd.results?.qualifyingResults || null,
        fastestLap: rd.results?.fastestLap || null,
      });
    }

    const completedRaceCount = completedRaces.length;

    // In incremental mode, only races from the cutoff onward are (re)scored.
    const racesToScore = incremental
      ? completedRaces.filter((r) => r.round >= fromRound!)
      : completedRaces;
    console.log(`[Repair] Found ${completedRaceCount} completed race(s); scoring ${racesToScore.length}`);

    // ─── Load driver/constructor prices for ace validation ───
    const [driverPriceSnap, ctorPriceSnap] = await Promise.all([
      db.collection('drivers').get(),
      db.collection('constructors').get(),
    ]);
    const driverPriceMap = new Map<string, number>();
    driverPriceSnap.docs.forEach((d) => driverPriceMap.set(d.id, d.data().price || 0));
    const ctorPriceMap = new Map<string, number>();
    ctorPriceSnap.docs.forEach((d) => ctorPriceMap.set(d.id, d.data().price || 0));

    // Build sorted driver/constructor lists for auto-fill
    const allDriversList: Array<{ id: string; name: string; shortName: string; constructorId: string; price: number }> = [];
    for (const d of driverPriceSnap.docs) {
      const dd = d.data();
      if (!dd.isActive) continue;
      allDriversList.push({
        id: d.id,
        name: dd.name || '',
        shortName: dd.shortName || '',
        constructorId: dd.constructorId || '',
        price: driverPriceMap.get(d.id) || dd.price || 0,
      });
    }
    allDriversList.sort((a, b) => a.price - b.price);

    const allCtorsList: Array<{ id: string; name: string; price: number }> = [];
    for (const c of ctorPriceSnap.docs) {
      const cd = c.data();
      if (!cd.isActive) continue;
      allCtorsList.push({ id: c.id, name: cd.name || '', price: ctorPriceMap.get(c.id) || cd.price || 0 });
    }
    allCtorsList.sort((a, b) => a.price - b.price);

    // ─── Process each team ───
    const teamsSnap = await db.collection('fantasyTeams').get();
    const teamOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    const leagueMemberOps: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, any> }> = [];
    const affectedLeagueIds = new Set<string>();
    const repairLog: Array<{ teamId: string; name: string; oldTotal: number; newTotal: number; changes: string[] }> = [];

    for (const teamDoc of teamsSnap.docs) {
      const team = teamDoc.data() as FantasyTeam & Record<string, unknown>;
      const changes: string[] = [];

      // Start from the team's original roster (before any scoring)
      // We'll reconstruct what the drivers array looked like at team creation
      let drivers = [...(team.drivers || [])] as FantasyDriver[];
      let teamCtor = getTeamCtor(team as Record<string, any>);

      // FULL mode rebuilds from scratch; INCREMENTAL mode keeps the stored
      // pointsScored/racesHeld/total/scoredRaces as the preserved baseline.
      if (!incremental) {
        drivers = drivers.map(d => ({ ...d, pointsScored: 0, racesHeld: 0 }));
        if (teamCtor) {
          teamCtor = { ...teamCtor, pointsScored: 0, racesHeld: 0 };
        }
      }

      let totalPoints = incremental ? (team.totalPoints || 0) : 0;
      let aceDriverId = team.aceDriverId;
      let aceConstructorId = team.aceConstructorId;
      const scoredRaceIds: string[] = incremental ? [...((team.scoredRaces as string[]) || [])] : [];

      // ─── Score each race in range ───
      for (const race of racesToScore) {
        const raceResultsMap = new Map<string, RaceResult>();
        race.raceResults.forEach((r) => raceResultsMap.set(r.driverId, r));

        const sprintResultsMap = new Map<string, SprintResult>();
        if (race.sprintResults) {
          race.sprintResults.forEach((r) => sprintResultsMap.set(r.driverId, r));
        }

        const qualifyingResultsMap = new Map<string, QualifyingResult>();
        if (race.qualifyingResults) {
          race.qualifyingResults.forEach((r) => qualifyingResultsMap.set(r.driverId, r));
        }

        // ── Qualifying scoring (quarter-rate, standalone) ──
        // Runs on every weekend including sprint rounds, matching live scoring.
        // Skip if already banked (incremental mode preserves prior scoring).
        if (race.qualifyingScored && race.qualifyingResults
            && !scoredRaceIds.includes(`quali_${race.raceId}`)) {
          let qualiTeamPts = 0;

          drivers = drivers.map(driver => {
            let isAce = driver.driverId === aceDriverId;
            // Use purchasePrice for ace validation — reflects pre-race price
            if (isAce && (driver.purchasePrice || 0) > ACE_MAX_PRICE) {
              isAce = false;
            }

            const qr = qualifyingResultsMap.get(driver.driverId);
            let qualiPts = qr ? calculateQualifyingPoints(qr.position) : 0;
            if (isAce) qualiPts *= 2;

            qualiTeamPts += qualiPts;
            return { ...driver, pointsScored: (driver.pointsScored || 0) + qualiPts };
          });

          if (teamCtor) {
            let isAceCtor = aceConstructorId === teamCtor.constructorId;
            if (isAceCtor && (teamCtor.purchasePrice || 0) > ACE_MAX_PRICE) {
              isAceCtor = false;
            }

            let ctorQualiPts = 0;
            const ctorQualiResults = race.qualifyingResults.filter(
              (r) => r.constructorId === teamCtor!.constructorId
            );
            for (const qr of ctorQualiResults) {
              ctorQualiPts += calculateQualifyingPoints(qr.position);
            }
            if (isAceCtor) ctorQualiPts *= 2;
            qualiTeamPts += ctorQualiPts;
            teamCtor = { ...teamCtor, pointsScored: (teamCtor.pointsScored || 0) + ctorQualiPts };
          }

          totalPoints += qualiTeamPts;
          scoredRaceIds.push(`quali_${race.raceId}`);
        }

        // ── Race scoring ── (skip if already banked, for incremental mode)
        if (!scoredRaceIds.includes(race.raceId)) {
        let raceTeamPts = 0;

        // Mirror live scoring's gates exactly:
        //  • sprint is folded into race scoring ONLY if it wasn't already
        //    scored standalone on Saturday (sprint_<raceId> banked) — feeding
        //    it in unconditionally double-counted sprints in repair;
        //  • quali is folded into race scoring ONLY if it was never scored
        //    standalone (live's scoreQualifying path) — omitting it
        //    under-counted quali for races scored at race-completion time.
        const sprintBanked = scoredRaceIds.includes(`sprint_${race.raceId}`);
        const qualiBanked = scoredRaceIds.includes(`quali_${race.raceId}`);
        const includeQuali = !race.qualifyingScored && !qualiBanked
          && !!race.qualifyingResults && race.qualifyingResults.length > 0;

        drivers = drivers.map(driver => {
          const raceResult = raceResultsMap.get(driver.driverId);
          const sprintResult = sprintBanked ? null : (sprintResultsMap.get(driver.driverId) || null);
          let isAce = driver.driverId === aceDriverId;
          // Use purchasePrice for ace validation — reflects pre-race price
          if (isAce && (driver.purchasePrice || 0) > ACE_MAX_PRICE) {
            isAce = false;
          }

          let driverPts = 0;
          if (raceResult) {
            driverPts = calculateDriverPoints(raceResult, sprintResult, driver.racesHeld, isAce);
          }

          if (includeQuali) {
            const qr = qualifyingResultsMap.get(driver.driverId);
            if (qr) {
              let qPts = calculateQualifyingPoints(qr.position);
              if (isAce) qPts *= 2;
              driverPts += qPts;
            }
          }

          raceTeamPts += driverPts;
          return {
            ...driver,
            pointsScored: (driver.pointsScored || 0) + driverPts,
            racesHeld: (driver.racesHeld || 0) + 1,
          };
        });

        // Constructor race scoring
        if (teamCtor) {
          let isAceCtor = aceConstructorId === teamCtor.constructorId;
          if (isAceCtor && (teamCtor.purchasePrice || 0) > ACE_MAX_PRICE) {
            isAceCtor = false;
          }

          let ctorPts = 0;
          const ctorDriverResults = race.raceResults.filter(
            (r) => r.constructorId === teamCtor!.constructorId
          );
          for (const result of ctorDriverResults) {
            if (result.status === 'finished') {
              if (result.position >= 1 && result.position <= RACE_POINTS.length) {
                ctorPts += RACE_POINTS[result.position - 1];
              }
              if (result.position >= 1 && result.position <= GRID_SIZE) {
                ctorPts += GRID_SIZE + 1 - result.position;
              }
            }
          }

          // Constructors do not earn sprint points (matches live scoring + spec).

          // Quali folded into race scoring when not scored standalone — mirrors
          // live's scoreQualifying constructor path (added before ace doubling).
          if (includeQuali && race.qualifyingResults) {
            const ctorQualiResults = race.qualifyingResults.filter(
              (r) => r.constructorId === teamCtor!.constructorId
            );
            for (const qr of ctorQualiResults) {
              ctorPts += calculateQualifyingPoints(qr.position);
            }
          }

          if (isAceCtor) ctorPts *= 2;
          // Lock bonus is loyalty-based and is NOT doubled by ace (per scoring spec).
          ctorPts += calculateLockBonus(teamCtor.racesHeld);

          raceTeamPts += ctorPts;
          teamCtor = {
            ...teamCtor,
            pointsScored: (teamCtor.pointsScored || 0) + ctorPts,
            racesHeld: (teamCtor.racesHeld || 0) + 1,
          };
        }

        // NOTE: the per-race stale-roster penalty applied by live scoring is NOT
        // reapplied here. `racesSinceTransfer` is a single current snapshot, not
        // per-race history — multiplying it across every completed race (as the old
        // code did) massively over-penalized rebuilt totals. Live scoring remains the
        // source of truth for the stale penalty; repair leaves the already-applied
        // penalties intact via the team's stored totalPoints baseline.

        totalPoints += raceTeamPts;
        scoredRaceIds.push(race.raceId);
        }
      }

      // ─── Contract expiry (Phase 3.5 equivalent) — full rebuild only ───
      // Preserved baselines: used as-is in incremental mode, recomputed in full mode.
      let lockedPoints = (team.lockedPoints as number) || 0;
      let existingLockouts: Record<string, number> = { ...((team.driverLockouts as Record<string, number>) || {}) };

      if (!incremental) {
      lockedPoints = 0;
      const lockouts: Record<string, number> = {};
      let budget = (team.budget as number) ?? 0;

      // First, undo the budget changes from the corrupted state
      // We need the original budget. Approximate: current budget + (expired driver sale returns already applied)
      // Actually, just recalculate budget from totalSpent
      const totalSpent = (team.totalSpent as number) ?? 0;
      budget = 1000 - totalSpent; // Reset to original budget (BUDGET = 1000)

      let saleReturns = 0;
      let autoFillCosts = 0;
      const expiredDriverIds: string[] = [];
      let constructorExpired = false;

      const remainingDrivers: FantasyDriver[] = [];
      for (const driver of drivers) {
        const contractLen = driver.contractLength || CONTRACT_LENGTH_DEFAULT;
        if (driver.racesHeld >= contractLen) {
          // Expired
          const currentPrice = driverPriceMap.get(driver.driverId) || driver.currentPrice;
          saleReturns += currentPrice;
          lockedPoints += driver.pointsScored;
          lockouts[driver.driverId] = completedRaceCount + CONTRACT_LOCKOUT_RACES;
          expiredDriverIds.push(driver.driverId);
          if (aceDriverId === driver.driverId) aceDriverId = undefined;
          changes.push(`Expired driver ${driver.shortName} (pts=${driver.pointsScored}, price=$${currentPrice})`);
        } else {
          // Update price to current market price
          remainingDrivers.push({
            ...driver,
            currentPrice: driverPriceMap.get(driver.driverId) || driver.currentPrice,
          });
        }
      }
      drivers = remainingDrivers;

      let expiredConstructorId: string | undefined;
      if (teamCtor) {
        const cContractLen = teamCtor.contractLength || CONTRACT_LENGTH_DEFAULT;
        if (teamCtor.racesHeld >= cContractLen) {
          const currentPrice = ctorPriceMap.get(teamCtor.constructorId) || teamCtor.currentPrice;
          saleReturns += currentPrice;
          lockedPoints += teamCtor.pointsScored;
          expiredConstructorId = teamCtor.constructorId;
          if (aceConstructorId === teamCtor.constructorId) aceConstructorId = undefined;
          changes.push(`Expired constructor ${teamCtor.name} (pts=${teamCtor.pointsScored}, price=$${currentPrice})`);
          teamCtor = null;
          constructorExpired = true;
        } else if (teamCtor) {
          teamCtor = {
            ...teamCtor,
            currentPrice: ctorPriceMap.get(teamCtor.constructorId) || teamCtor.currentPrice,
          };
        }
      }

      // Auto-fill expired driver slots
      if (expiredDriverIds.length > 0) {
        const teamDriverIds = new Set(drivers.map(d => d.driverId));
        const expiredSet = new Set(expiredDriverIds);
        let fillBudget = budget + saleReturns - autoFillCosts;

        for (const candidate of allDriversList) {
          if (drivers.length >= TEAM_SIZE) break;
          if (candidate.price > fillBudget) break;
          if (teamDriverIds.has(candidate.id)) continue;
          if (expiredSet.has(candidate.id)) continue;
          const lockExpiry = lockouts[candidate.id];
          if (lockExpiry !== undefined && completedRaceCount < lockExpiry) continue;

          drivers.push({
            driverId: candidate.id,
            name: candidate.name,
            shortName: candidate.shortName,
            constructorId: candidate.constructorId,
            purchasePrice: candidate.price,
            currentPrice: candidate.price,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: CONTRACT_LENGTH_DEFAULT,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          });
          teamDriverIds.add(candidate.id);
          autoFillCosts += candidate.price;
          fillBudget -= candidate.price;
          changes.push(`Auto-filled driver ${candidate.shortName} ($${candidate.price})`);
        }
      }

      // Auto-fill expired constructor slot
      if (constructorExpired) {
        let fillBudget = budget + saleReturns - autoFillCosts;
        for (const candidate of allCtorsList) {
          if (candidate.price > fillBudget) break;
          if (candidate.id === expiredConstructorId) continue;

          teamCtor = {
            constructorId: candidate.id,
            name: candidate.name,
            purchasePrice: candidate.price,
            currentPrice: candidate.price,
            pointsScored: 0,
            racesHeld: 0,
            contractLength: CONTRACT_LENGTH_DEFAULT,
            isReservePick: true,
            addedAtRace: completedRaceCount,
          };
          autoFillCosts += candidate.price;
          changes.push(`Auto-filled constructor ${candidate.name} ($${candidate.price})`);
          break;
        }
      }

      // newBudget computed but not written — manual recalc is read-only for roster/budget
      void (budget + saleReturns - autoFillCosts);

      // Ace auto-clear if price exceeded
      if (aceDriverId) {
        const aceDriver = drivers.find(d => d.driverId === aceDriverId);
        if (aceDriver && aceDriver.currentPrice > ACE_MAX_PRICE) {
          changes.push(`Cleared ace ${aceDriverId} (price $${aceDriver.currentPrice} > $${ACE_MAX_PRICE})`);
          aceDriverId = undefined;
        }
      }
      if (aceConstructorId && teamCtor) {
        if (teamCtor.currentPrice > ACE_MAX_PRICE) {
          changes.push(`Cleared ace constructor ${aceConstructorId}`);
          aceConstructorId = undefined;
        }
      }

      // Prune expired lockouts
      existingLockouts = { ...(team.driverLockouts || {}), ...lockouts };
      for (const [dId, expiresAt] of Object.entries(existingLockouts)) {
        if (completedRaceCount >= expiresAt) {
          delete existingLockouts[dId];
        }
      }
      } // end full-rebuild contract expiry

      // ─── Compare with current state and build update ───
      const oldTotal = team.totalPoints || 0;
      const oldLocked = (team.lockedPoints as number) || 0;

      if (totalPoints !== oldTotal) {
        changes.push(`totalPoints: ${oldTotal} → ${totalPoints}`);
      }
      if (lockedPoints !== oldLocked) {
        changes.push(`lockedPoints: ${oldLocked} → ${lockedPoints}`);
      }

      // Check if any driver pointsScored differ
      for (const driver of drivers) {
        const oldDriver = (team.drivers || []).find((d: FantasyDriver) => d.driverId === driver.driverId);
        if (oldDriver && (oldDriver.pointsScored || 0) !== driver.pointsScored) {
          changes.push(`${driver.shortName} pointsScored: ${oldDriver.pointsScored || 0} → ${driver.pointsScored}`);
        }
      }

      repairLog.push({
        teamId: teamDoc.id,
        name: (team as any).name || 'Unknown',
        oldTotal,
        newTotal: totalPoints,
        changes,
      });

      if (changes.length === 0) continue; // No changes needed

      // Build update data — SAFE: only update points and scoring records.
      // NEVER overwrite drivers, constructor, budget, lockedPoints, or ace settings.
      // Those are managed by the live scoring pipeline (onRaceCompleted) only.
      const updateData: Record<string, any> = {
        totalPoints,
        scoredRaces: scoredRaceIds,
      };

      // Lockouts are only recomputed/rewritten in full mode; incremental mode
      // preserves the stored driverLockouts exactly.
      if (!incremental) {
        if (Object.keys(existingLockouts).length > 0) {
          updateData.driverLockouts = existingLockouts;
        } else {
          updateData.driverLockouts = admin.firestore.FieldValue.delete();
        }
      }

      teamOps.push({ ref: teamDoc.ref, data: updateData });

      // Fix league member totalPoints. Member totals are ALWAYS
      // totalPoints + lockedPoints (matching the live pipeline's Phase 4 and
      // the quali/sprint syncs) — writing bare totalPoints here used to drop
      // every member with banked points down the leaderboard until the next
      // race resynced them.
      if (team.leagueId && team.userId) {
        const memberRef = db
          .collection('leagues')
          .doc(team.leagueId)
          .collection('members')
          .doc(team.userId);
        leagueMemberOps.push({
          ref: memberRef,
          data: { totalPoints: totalPoints + lockedPoints },
        });
        affectedLeagueIds.add(team.leagueId);
      }
    }

    console.log(`[Repair] ${teamOps.length} teams need fixing out of ${teamsSnap.size}`);
    for (const log of repairLog) {
      if (log.changes.length > 0) {
        console.log(`[Repair] ${log.name} (${log.teamId}): ${log.changes.join(', ')}`);
      }
    }

    if (!dryRun) {
      await commitInBatches(teamOps);
      await commitInBatches(leagueMemberOps);
      // Re-rank affected leagues so member ranks reflect the repaired totals.
      for (const leagueId of affectedLeagueIds) {
        await rankLeagueMembers(leagueId);
      }
      console.log(`[Repair] Committed ${teamOps.length} team updates + ${leagueMemberOps.length} league member updates`);
    }

    return {
      success: true,
      dryRun,
      mode: incremental ? 'incremental' : 'full',
      fromRound,
      racesScored: racesToScore.length,
      teamsFixed: teamOps.length,
      leagueMembersFixed: leagueMemberOps.length,
      details: repairLog.filter(l => l.changes.length > 0).map(l => ({
        name: l.name,
        oldTotal: l.oldTotal,
        newTotal: l.newTotal,
        changes: l.changes,
      })),
    };
  });
