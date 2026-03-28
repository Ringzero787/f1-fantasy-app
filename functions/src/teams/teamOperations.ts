import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const BUDGET = 1000;
const TEAM_SIZE = 5;
const MAX_TEAMS_PER_USER = 2;

/**
 * Server-side team creation with validation.
 * Enforces max 2 teams per user.
 */
export const createTeamSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { name, leagueId } = data;
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Team name must be at least 2 characters');
  }

  const userId = context.auth.uid;

  // Check team count
  const existingTeams = await db.collection('fantasyTeams')
    .where('userId', '==', userId)
    .get();

  if (existingTeams.size >= MAX_TEAMS_PER_USER) {
    throw new functions.https.HttpsError('failed-precondition', `Maximum ${MAX_TEAMS_PER_USER} teams allowed`);
  }

  const teamRef = db.collection('fantasyTeams').doc();
  const team = {
    userId,
    name: name.trim(),
    leagueId: leagueId || null,
    drivers: [],
    constructor: null,
    budget: BUDGET,
    totalSpent: 0,
    totalPoints: 0,
    lockedPoints: 0,
    isLocked: false,
    lockStatus: {
      isSeasonLocked: false,
      seasonLockRacesRemaining: 0,
      nextUnlockTime: null,
      canModify: true,
      lockReason: null,
    },
    aceDriverId: null,
    aceConstructorId: null,
    racesSinceTransfer: 0,
    racesPlayed: 0,
    pointsHistory: [],
    joinedAtRace: 0,
    raceWins: 0,
    scoredRaces: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await teamRef.set(team);

  return { teamId: teamRef.id, ...team, id: teamRef.id };
});

/**
 * Server-side add driver with budget validation.
 * Prevents budget manipulation from modified clients.
 */
export const addDriverSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, driverId, contractLength } = data;
  if (!teamId || !driverId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and driverId required');
  }

  const userId = context.auth.uid;

  // Get team
  const teamDoc = await db.collection('fantasyTeams').doc(teamId).get();
  if (!teamDoc.exists) throw new functions.https.HttpsError('not-found', 'Team not found');
  const team = teamDoc.data()!;
  if (team.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Not your team');

  // Check team is not locked
  if (team.isLocked) throw new functions.https.HttpsError('failed-precondition', 'Team is locked');

  // Check driver count
  const drivers = team.drivers || [];
  if (drivers.length >= TEAM_SIZE) throw new functions.https.HttpsError('failed-precondition', 'Team is full');

  // Check driver not already on team
  if (drivers.some((d: any) => d.driverId === driverId)) {
    throw new functions.https.HttpsError('already-exists', 'Driver already on team');
  }

  // Get driver price from server (source of truth)
  const driverDoc = await db.collection('drivers').doc(driverId).get();
  if (!driverDoc.exists) throw new functions.https.HttpsError('not-found', 'Driver not found');
  const driver = driverDoc.data()!;

  // Validate budget server-side
  const serverBudget = team.budget ?? BUDGET;
  if (driver.price > serverBudget) {
    throw new functions.https.HttpsError('failed-precondition',
      `Cannot afford ${driver.name} ($${driver.price}). Budget: $${serverBudget}`);
  }

  // Get completed race count for addedAtRace
  const completedRaces = await db.collection('races')
    .where('status', '==', 'completed')
    .get();

  const fantasyDriver = {
    driverId: driver.id || driverId,
    name: driver.name,
    shortName: driver.shortName,
    constructorId: driver.constructorId,
    purchasePrice: driver.price,
    currentPrice: driver.price,
    pointsScored: 0,
    racesHeld: 0,
    contractLength: contractLength || 3,
    addedAtRace: completedRaces.size,
  };

  await teamDoc.ref.update({
    drivers: admin.firestore.FieldValue.arrayUnion(fantasyDriver),
    budget: serverBudget - driver.price,
    totalSpent: (team.totalSpent || 0) + driver.price,
    racesSinceTransfer: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, driver: fantasyDriver, newBudget: serverBudget - driver.price };
});

/**
 * Server-side remove driver with sell price calculation.
 */
export const removeDriverSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { teamId, driverId } = data;
  if (!teamId || !driverId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and driverId required');
  }

  const userId = context.auth.uid;

  const teamDoc = await db.collection('fantasyTeams').doc(teamId).get();
  if (!teamDoc.exists) throw new functions.https.HttpsError('not-found', 'Team not found');
  const team = teamDoc.data()!;
  if (team.userId !== userId) throw new functions.https.HttpsError('permission-denied', 'Not your team');
  if (team.isLocked) throw new functions.https.HttpsError('failed-precondition', 'Team is locked');

  const drivers = team.drivers || [];
  const driver = drivers.find((d: any) => d.driverId === driverId);
  if (!driver) throw new functions.https.HttpsError('not-found', 'Driver not on team');

  // Get current market price from server
  const driverDoc = await db.collection('drivers').doc(driverId).get();
  const marketPrice = driverDoc.exists ? driverDoc.data()!.price : driver.currentPrice;

  // Calculate early termination fee
  const racesLeft = (driver.contractLength || 3) - (driver.racesHeld || 0);
  const earlyTermFee = racesLeft > 0 ? Math.round(marketPrice * 0.1 * racesLeft) : 0;
  const saleReturn = marketPrice - earlyTermFee;

  // Bank points from departing driver
  const bankedPoints = driver.pointsScored || 0;

  // Remove driver and update budget
  const updatedDrivers = drivers.filter((d: any) => d.driverId !== driverId);

  const updateData: any = {
    drivers: updatedDrivers,
    budget: (team.budget || 0) + saleReturn,
    lockedPoints: (team.lockedPoints || 0) + bankedPoints,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Clear ace if removing the ace driver
  if (team.aceDriverId === driverId) {
    updateData.aceDriverId = null;
  }

  await teamDoc.ref.update(updateData);

  return { success: true, saleReturn, earlyTermFee, bankedPoints };
});
