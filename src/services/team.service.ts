import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import { BUDGET, TEAM_SIZE } from '../config/constants';

// ─── Server-authoritative roster callables ───
// All roster/budget mutations go through Cloud Functions: prices are read
// server-side inside a transaction, fees are computed by ONE implementation
// (quoteSale in functions/src/teams/teamOperations.ts), and sold entities'
// points are banked with the compensating totalPoints decrement. Direct
// Firestore writes to drivers/constructor/budget/totalSpent are denied by
// security rules.
const callAddDriver = httpsCallable(functions, 'addDriverSecure');
const callRemoveDriver = httpsCallable(functions, 'removeDriverSecure');
const callSetConstructor = httpsCallable(functions, 'setConstructorSecure');
const callRemoveConstructor = httpsCallable(functions, 'removeConstructorSecure');
const callBuildTeam = httpsCallable(functions, 'buildTeamSecure');
const callQuoteSale = httpsCallable(functions, 'quoteSaleSecure');

export interface SaleQuote {
  marketPrice: number;
  earlyTermFee: number;
  saleReturn: number;
  feeWaived: boolean;
  bankedPoints: number;
}
import type {
  FantasyTeam,
  FantasyDriver,
  FantasyConstructor,
  LockStatus,
  Driver,
  Constructor,
  Transaction,
  TeamSelectionState,
} from '../types';
import { driverService } from './driver.service';
import { constructorService } from './constructor.service';

const teamsCollection = collection(db, 'fantasyTeams');
const transactionsCollection = collection(db, 'transactions');

export const teamService = {
  /**
   * Create a new fantasy team
   */
  async createTeam(
    userId: string,
    leagueId: string | null,
    teamName: string
  ): Promise<FantasyTeam> {
    // Check if user already has a team in this league (only if league specified)
    if (leagueId) {
      const existingTeam = await this.getUserTeamInLeague(userId, leagueId);
      if (existingTeam) {
        throw new Error('You already have a team in this league');
      }
    }

    // Check for duplicate team name globally
    const nameQuery = query(
      teamsCollection,
      where('name', '==', teamName),
      limit(1)
    );
    const nameSnapshot = await getDocs(nameQuery);
    if (!nameSnapshot.empty) {
      throw new Error('A team with this name already exists');
    }

    const teamData = {
      userId,
      leagueId,
      name: teamName,
      drivers: [],
      constructor: null,
      budget: BUDGET,
      totalSpent: 0,
      totalPoints: 0,
      isLocked: false,
      lockStatus: {
        isSeasonLocked: false,
        seasonLockRacesRemaining: 0,
        canModify: true,
      },
      // V3: Ace and transfer tracking
      aceDriverId: null,
      racesSinceTransfer: 0,
      // V4: Late joiner support
      racesPlayed: 0,
      pointsHistory: [],
      joinedAtRace: 0,
      raceWins: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const teamRef = await addDoc(teamsCollection, teamData);

    return {
      id: teamRef.id,
      ...teamData,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as FantasyTeam;
  },

  /**
   * Get team by ID
   */
  async getTeamById(teamId: string): Promise<FantasyTeam | null> {
    const docRef = doc(db, 'fantasyTeams', teamId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return { id: docSnap.id, ...docSnap.data() } as FantasyTeam;
  },

  /**
   * Get user's team in a specific league
   */
  async getUserTeamInLeague(userId: string, leagueId: string): Promise<FantasyTeam | null> {
    const q = query(
      teamsCollection,
      where('userId', '==', userId),
      where('leagueId', '==', leagueId),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      constructor: (data as Record<string, any>)['constructor'] ?? null,
    } as FantasyTeam;
  },

  /**
   * Get all teams for a user
   */
  async getUserTeams(userId: string): Promise<FantasyTeam[]> {
    const q = query(teamsCollection, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FantasyTeam[];
  },

  /**
   * Get all teams in a league
   */
  async getLeagueTeams(leagueId: string): Promise<FantasyTeam[]> {
    const q = query(
      teamsCollection,
      where('leagueId', '==', leagueId),
      orderBy('totalPoints', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FantasyTeam[];
  },

  /**
   * Add a driver to the team — server-authoritative via addDriverSecure.
   * Price, budget check, lockouts, and lock state are validated server-side
   * inside a transaction.
   */
  async addDriver(
    teamId: string,
    driverId: string,
    contractLength?: number
  ): Promise<FantasyTeam> {
    const res: any = await callAddDriver({ teamId, driverId, contractLength });

    const team = await this.getTeamById(teamId);
    if (team) {
      this.recordTransaction({
        userId: team.userId,
        leagueId: team.leagueId,
        teamId,
        type: 'buy',
        entityType: 'driver',
        entityId: driverId,
        entityName: res?.data?.driver?.name || driverId,
        price: res?.data?.driver?.purchasePrice ?? 0,
      }).catch(() => { /* transaction log is best-effort */ });
    }

    if (!team) throw new Error('Team not found');
    return team;
  },

  /**
   * Remove (sell) a driver — server-authoritative via removeDriverSecure.
   * The server banks the driver's points (lockedPoints += pts,
   * totalPoints -= pts) and computes the sale return with the single
   * authoritative fee implementation.
   */
  async removeDriver(teamId: string, driverId: string): Promise<FantasyTeam> {
    const res: any = await callRemoveDriver({ teamId, driverId });

    const team = await this.getTeamById(teamId);
    if (team) {
      this.recordTransaction({
        userId: team.userId,
        leagueId: team.leagueId,
        teamId,
        type: 'sell',
        entityType: 'driver',
        entityId: driverId,
        entityName: driverId,
        price: res?.data?.saleReturn ?? 0,
      }).catch(() => { /* transaction log is best-effort */ });
    }

    if (!team) throw new Error('Team not found');
    return team;
  },

  /**
   * Set (buy) team constructor — server-authoritative via setConstructorSecure.
   * If a constructor is already held it is sold server-side in the same
   * transaction with the standard sale quote.
   */
  async setConstructor(teamId: string, constructorId: string, contractLength?: number): Promise<FantasyTeam> {
    const res: any = await callSetConstructor({ teamId, constructorId, contractLength });

    const team = await this.getTeamById(teamId);
    if (team) {
      this.recordTransaction({
        userId: team.userId,
        leagueId: team.leagueId,
        teamId,
        type: 'buy',
        entityType: 'constructor',
        entityId: constructorId,
        entityName: res?.data?.constructor?.name || constructorId,
        price: res?.data?.constructor?.purchasePrice ?? 0,
      }).catch(() => { /* transaction log is best-effort */ });
    }

    if (!team) throw new Error('Team not found');
    return team;
  },

  /**
   * Build the initial roster (all drivers + constructor) atomically at server
   * prices. Only valid while the team's roster is empty.
   */
  async buildTeam(
    teamId: string,
    driverIds: string[],
    constructorId: string | null
  ): Promise<FantasyTeam> {
    await callBuildTeam({ teamId, driverIds, constructorId: constructorId || undefined });
    const team = await this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');
    return team;
  },

  /**
   * Get the exact sale quote (fee, return, banked points) the server would
   * apply — for confirm dialogs, so the quoted number IS the charged number.
   */
  async getSaleQuote(
    teamId: string,
    entityType: 'driver' | 'constructor',
    driverId?: string
  ): Promise<SaleQuote> {
    const res: any = await callQuoteSale({ teamId, entityType, driverId });
    return res.data as SaleQuote;
  },

  /**
   * V3: Set ace driver (gets 2x points for that race weekend)
   * Any driver on the team can be ace - must be set before qualifying
   */
  async setAce(teamId: string, driverId: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.lockStatus.canModify) {
      throw new Error('Team is locked and cannot be modified');
    }

    const driverExists = team.drivers.some((d) => d.driverId === driverId);
    if (!driverExists) {
      throw new Error('Driver not in team');
    }

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      aceDriverId: driverId,
      updatedAt: serverTimestamp(),
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * V3: Clear ace selection
   */
  async clearAce(teamId: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      aceDriverId: null,
      updatedAt: serverTimestamp(),
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * V3: Update transfer tracking after a transfer is made
   */
  async updateTransferTracking(teamId: string, raceId: string): Promise<void> {
    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      lastTransferRaceId: raceId,
      racesSinceTransfer: 0,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * V3: Increment races since transfer counter (called after each race)
   */
  async incrementRacesSinceTransfer(teamId: string): Promise<void> {
    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      racesSinceTransfer: increment(1),
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Remove (sell) constructor — server-authoritative via removeConstructorSecure.
   */
  async removeConstructor(teamId: string): Promise<FantasyTeam> {
    const res: any = await callRemoveConstructor({ teamId });

    const team = await this.getTeamById(teamId);
    if (team) {
      this.recordTransaction({
        userId: team.userId,
        leagueId: team.leagueId,
        teamId,
        type: 'sell',
        entityType: 'constructor',
        entityId: 'constructor',
        entityName: 'Constructor',
        price: res?.data?.saleReturn ?? 0,
      }).catch(() => { /* transaction log is best-effort */ });
    }

    if (!team) throw new Error('Team not found');
    return team;
  },

  /**
   * Swap a driver: sell + buy as two server transactions. Not atomic across
   * the pair — if the buy fails after the sell succeeded, the user keeps the
   * sale proceeds and an open slot (same outcome as selling then changing
   * their mind), never an inconsistent roster.
   */
  async swapDriver(teamId: string, oldDriverId: string, newDriverId: string): Promise<FantasyTeam> {
    await callRemoveDriver({ teamId, driverId: oldDriverId });
    try {
      await callAddDriver({ teamId, driverId: newDriverId });
    } catch (err) {
      // Sell succeeded, buy failed — surface the error with honest state.
      const team = await this.getTeamById(teamId);
      const message = err instanceof Error ? err.message : 'Buy failed';
      throw new Error(`Sold ${oldDriverId} but could not buy ${newDriverId}: ${message}. ` +
        `Sale proceeds are in your budget${team ? ` ($${team.budget})` : ''}.`);
    }

    const team = await this.getTeamById(teamId);
    if (!team) throw new Error('Team not found');
    return team;
  },

  /**
   * Update team name
   */
  async updateTeamName(teamId: string, name: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    // Check for duplicate team name globally (exclude current team)
    const nameQuery = query(
      teamsCollection,
      where('name', '==', name),
      limit(1)
    );
    const nameSnapshot = await getDocs(nameQuery);
    if (!nameSnapshot.empty && nameSnapshot.docs[0].id !== teamId) {
      throw new Error('A team with this name already exists');
    }

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      name,
      updatedAt: serverTimestamp(),
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * Update team with partial data
   */
  async updateTeam(teamId: string, updates: Partial<Pick<FantasyTeam, 'name' | 'leagueId'>>): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * Sync a team's METADATA to Firestore (name, avatar, ace, leagueId, …).
   *
   * Roster, budget, points, and locks are server-authoritative and are NEVER
   * written from the client — security rules deny them, and the roster
   * callables are the only writers. (The old fullWrite mode replaced the
   * whole drivers array with scoring fields stripped, which DELETED
   * pointsScored/racesHeld server-side on every buy — resetting loyalty
   * bonuses and contract clocks.)
   */
  async syncTeam(team: FantasyTeam): Promise<void> {
    const teamRef = doc(db, 'fantasyTeams', team.id);

    // Helper to convert undefined to null recursively
    const sanitizeForFirebase = (obj: any): any => {
      if (obj === undefined) return null;
      if (obj === null) return null;
      if (Array.isArray(obj)) return obj.map(sanitizeForFirebase);
      if (typeof obj === 'object' && obj !== null) {
        const result: any = {};
        for (const key of Object.keys(obj)) {
          result[key] = sanitizeForFirebase(obj[key]);
        }
        return result;
      }
      return obj;
    };

    // Strip everything server-authoritative (must mirror the denied-keys list
    // in firestore.rules — a stale local value for any of these would make the
    // whole update fail the rules check).
    const {
      id, createdAt, updatedAt,
      totalPoints, lockedPoints,
      isLocked, lockStatus,
      budget, totalSpent,
      scoredRaces,
      drivers,
      constructor: teamCtor,
      racesSinceTransfer,
      driverLockouts,
      ...metadataOnly
    } = team as any;

    const sanitizedData = sanitizeForFirebase({ ...metadataOnly });

    // Use updateDoc (NOT setDoc/merge): syncTeam must only ever UPDATE an existing
    // team. New teams are created via createTeam (addDoc). setDoc/merge would
    // re-create a team that was deleted server-side (e.g. admin cleanup of a
    // duplicate), resurrecting it as an empty "ghost". On not-found we skip.
    try {
      await updateDoc(teamRef, {
        ...sanitizedData,
        updatedAt: serverTimestamp(),
      });
    } catch (e: any) {
      if (e?.code === 'not-found') {
        console.warn(`[syncTeam] team ${team.id} no longer exists server-side; skipping (not re-creating)`);
        return;
      }
      throw e;
    }
  },

  /**
   * Sync multiple teams to Firebase
   */
  async syncTeams(teams: FantasyTeam[]): Promise<void> {
    await Promise.all(teams.map(team => this.syncTeam(team)));
  },

  /**
   * Delete team
   */
  async deleteTeam(teamId: string): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await deleteDoc(teamRef);
  },

  /**
   * Validate team selection
   */
  validateTeamSelection(
    selectedDrivers: Driver[],
    selectedConstructor: Constructor | null,
    budget: number = BUDGET
  ): TeamSelectionState {
    const errors: string[] = [];
    const totalDriverCost = selectedDrivers.reduce((sum, d) => sum + d.price, 0);
    const constructorCost = selectedConstructor?.price || 0;
    const totalCost = totalDriverCost + constructorCost;
    const remainingBudget = budget - totalCost;

    // Validate driver count
    if (selectedDrivers.length > TEAM_SIZE) {
      errors.push(`Maximum ${TEAM_SIZE} drivers allowed`);
    }

    // Validate budget
    if (remainingBudget < 0) {
      errors.push('Budget exceeded');
    }

    // Validate unique drivers
    const uniqueIds = new Set(selectedDrivers.map((d) => d.id));
    if (uniqueIds.size !== selectedDrivers.length) {
      errors.push('Duplicate drivers not allowed');
    }

    const isValid =
      errors.length === 0 &&
      selectedDrivers.length === TEAM_SIZE &&
      selectedConstructor !== null &&
      remainingBudget >= 0;

    return {
      selectedDrivers: selectedDrivers.map((d) => d.id),
      selectedConstructor: selectedConstructor?.id || null,
      totalCost,
      remainingBudget,
      isValid,
      validationErrors: errors,
    };
  },

  /**
   * Record transaction
   */
  async recordTransaction(data: Omit<Transaction, 'id' | 'timestamp'>): Promise<void> {
    await addDoc(transactionsCollection, {
      ...data,
      timestamp: serverTimestamp(),
    });
  },

  /**
   * Get team transactions
   */
  async getTeamTransactions(teamId: string, limitCount: number = 20): Promise<Transaction[]> {
    const q = query(
      transactionsCollection,
      where('teamId', '==', teamId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Transaction[];
  },

};
