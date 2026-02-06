import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Points allocation
const RACE_POINTS = [45, 37, 33, 29, 26, 23, 20, 17, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1];
const FASTEST_LAP_BONUS = 1;
const POSITION_GAINED_BONUS = 1;

// Lock bonus tiers
const LOCK_BONUS = {
  TIER_1: { maxRaces: 3, bonus: 1 },
  TIER_2: { maxRaces: 6, bonus: 2 },
  TIER_3: { maxRaces: Infinity, bonus: 3 },
  FULL_SEASON_BONUS: 100,
  FULL_SEASON_RACES: 24,
};

interface RaceResult {
  position: number;
  driverId: string;
  constructorId: string;
  gridPosition: number;
  status: 'finished' | 'dnf' | 'dsq';
  fastestLap: boolean;
}

interface SprintResult {
  position: number;
  driverId: string;
  status: 'finished' | 'dnf' | 'dsq';
}

interface FantasyDriver {
  driverId: string;
  name: string;
  shortName: string;
  constructorId: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
  // V3: purchasedAtRaceId tracks when driver was added for hot hand bonus
  purchasedAtRaceId?: string;
}

interface FantasyConstructor {
  constructorId: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored: number;
  racesHeld: number;
}

interface FantasyTeam {
  userId: string;
  leagueId: string;
  drivers: FantasyDriver[];
  constructor: FantasyConstructor | null;
  totalPoints: number;
  budget: number;
  // V3: Captain system - one driver gets 2x points
  captainDriverId?: string;
  // V3: Transfer tracking for stale roster penalty and hot hand bonus
  lastTransferRaceId?: string;
  racesSinceTransfer: number;
}

/**
 * Calculate lock bonus based on races held
 */
function calculateLockBonus(racesHeld: number): number {
  if (racesHeld >= LOCK_BONUS.FULL_SEASON_RACES) {
    return LOCK_BONUS.FULL_SEASON_BONUS;
  }

  let bonus = 0;
  let remaining = racesHeld;

  // Tier 1: 1-3 races
  const tier1Races = Math.min(remaining, LOCK_BONUS.TIER_1.maxRaces);
  bonus += tier1Races * LOCK_BONUS.TIER_1.bonus;
  remaining -= tier1Races;

  // Tier 2: 4-6 races
  if (remaining > 0) {
    const tier2Races = Math.min(remaining, LOCK_BONUS.TIER_2.maxRaces - LOCK_BONUS.TIER_1.maxRaces);
    bonus += tier2Races * LOCK_BONUS.TIER_2.bonus;
    remaining -= tier2Races;
  }

  // Tier 3: 7+ races
  if (remaining > 0) {
    bonus += remaining * LOCK_BONUS.TIER_3.bonus;
  }

  return bonus;
}

/**
 * Calculate points for a driver based on race result
 * V3: isCaptain gives 2x multiplier on all points
 */
function calculateDriverPoints(
  result: RaceResult,
  sprintResult: SprintResult | null,
  racesHeld: number,
  isCaptain: boolean
): number {
  let points = 0;

  // Race points
  if (result.status === 'finished' && result.position <= RACE_POINTS.length) {
    points += RACE_POINTS[result.position - 1];
  }

  // Sprint points
  if (sprintResult && sprintResult.status === 'finished' && sprintResult.position <= SPRINT_POINTS.length) {
    points += SPRINT_POINTS[sprintResult.position - 1];
  }

  // Position gained bonus
  const positionsGained = result.gridPosition - result.position;
  if (positionsGained > 0) {
    points += positionsGained * POSITION_GAINED_BONUS;
  }

  // Fastest lap bonus (only if in points)
  if (result.fastestLap && result.position <= 10) {
    points += FASTEST_LAP_BONUS;
  }

  // DSQ penalty
  if (result.status === 'dsq') {
    points = -5;
  }

  // Lock bonus
  points += calculateLockBonus(racesHeld);

  // V3: Captain gets 2x multiplier on all points (including lock bonus)
  if (isCaptain) {
    points *= 2;
  }

  return points;
}

/**
 * Triggered when race results are added/updated
 * Calculates points for all fantasy teams in all leagues
 */
export const onRaceResultsUpdated = functions.firestore
  .document('races/{raceId}')
  .onUpdate(async (change, context) => {
    const raceId = context.params.raceId;
    const beforeData = change.before.data();
    const afterData = change.after.data();

    // Only process if results were just added
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

    // Create lookup maps for quick access
    const raceResultsMap = new Map<string, RaceResult>();
    raceResults.forEach((r) => raceResultsMap.set(r.driverId, r));

    const sprintResultsMap = new Map<string, SprintResult>();
    if (sprintResults) {
      sprintResults.forEach((r) => sprintResultsMap.set(r.driverId, r));
    }

    // Get all fantasy teams
    const teamsSnapshot = await db.collection('fantasyTeams').get();

    const batch = db.batch();
    const pointsUpdates: { leagueId: string; userId: string; points: number }[] = [];

    for (const teamDoc of teamsSnapshot.docs) {
      const team = teamDoc.data() as FantasyTeam;
      let teamPoints = 0;

      // V3: Get captain driver ID for 2x multiplier
      const captainDriverId = team.captainDriverId;

      // Calculate driver points
      const updatedDrivers: FantasyDriver[] = [];
      for (const driver of team.drivers) {
        const raceResult = raceResultsMap.get(driver.driverId);
        const sprintResult = sprintResultsMap.get(driver.driverId) || null;

        // V3: Check if this driver is the captain
        const isCaptain = driver.driverId === captainDriverId;

        let driverPoints = 0;
        if (raceResult) {
          driverPoints = calculateDriverPoints(
            raceResult,
            sprintResult,
            driver.racesHeld,
            isCaptain
          );
        }

        teamPoints += driverPoints;

        updatedDrivers.push({
          ...driver,
          pointsScored: driver.pointsScored + driverPoints,
          racesHeld: driver.racesHeld + 1,
        });
      }

      // Calculate constructor points (V3: no star/captain bonus for constructors)
      let updatedConstructor: FantasyConstructor | null = null;
      if (team.constructor) {
        const constructor = team.constructor;
        let constructorPoints = 0;

        // Constructor points = sum of both drivers' race points
        const constructorDriverResults = raceResults.filter(
          (r) => r.constructorId === constructor.constructorId
        );

        for (const result of constructorDriverResults) {
          if (result.status === 'finished' && result.position <= RACE_POINTS.length) {
            constructorPoints += RACE_POINTS[result.position - 1];
          }
        }

        // Add lock bonus for constructor
        constructorPoints += calculateLockBonus(constructor.racesHeld);

        teamPoints += constructorPoints;

        updatedConstructor = {
          ...constructor,
          pointsScored: constructor.pointsScored + constructorPoints,
          racesHeld: constructor.racesHeld + 1,
        };
      }

      // V3: Calculate stale roster penalty
      const racesSinceTransfer = team.racesSinceTransfer || 0;
      if (racesSinceTransfer > 5) {
        const stalePenalty = (racesSinceTransfer - 5) * 5; // -5 points per race after 5 races
        teamPoints -= stalePenalty;
      }

      // Update team document
      batch.update(teamDoc.ref, {
        drivers: updatedDrivers,
        constructor: updatedConstructor,
        totalPoints: admin.firestore.FieldValue.increment(teamPoints),
        // V3: Increment races since transfer
        racesSinceTransfer: admin.firestore.FieldValue.increment(1),
      });

      pointsUpdates.push({
        leagueId: team.leagueId,
        userId: team.userId,
        points: teamPoints,
      });
    }

    // Commit team updates
    await batch.commit();

    // Update league member points
    for (const update of pointsUpdates) {
      const memberRef = db
        .collection('leagues')
        .doc(update.leagueId)
        .collection('members')
        .doc(update.userId);

      await memberRef.update({
        totalPoints: admin.firestore.FieldValue.increment(update.points),
      });
    }

    // Recalculate rankings for each affected league
    const affectedLeagues = [...new Set(pointsUpdates.map((u) => u.leagueId))];
    for (const leagueId of affectedLeagues) {
      const membersSnapshot = await db
        .collection('leagues')
        .doc(leagueId)
        .collection('members')
        .orderBy('totalPoints', 'desc')
        .get();

      const rankBatch = db.batch();
      membersSnapshot.docs.forEach((doc, index) => {
        rankBatch.update(doc.ref, { rank: index + 1 });
      });
      await rankBatch.commit();
    }

    console.log(`Processed results for race ${raceId}, updated ${teamsSnapshot.size} teams`);
    return null;
  });

/**
 * HTTP function to manually trigger points calculation
 * Useful for testing or re-processing
 */
export const calculatePointsManually = functions.https.onCall(async (data, context) => {
  // Check authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

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

  // The actual calculation is done by the onRaceResultsUpdated trigger
  // This function just marks the race for reprocessing
  await raceDoc.ref.update({
    status: 'in_progress',
  });

  await raceDoc.ref.update({
    status: 'completed',
  });

  return { success: true, message: 'Points calculation triggered' };
});
