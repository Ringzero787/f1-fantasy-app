import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
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
import { db } from '../config/firebase';
import { BUDGET, TEAM_SIZE, EARLY_UNLOCK_FEE, SALE_COMMISSION_RATE } from '../config/constants';

// Calculate sale value after commission
const calculateSaleValue = (currentPrice: number): number => {
  return Math.floor(currentPrice * (1 - SALE_COMMISSION_RATE));
};
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
    } as FantasyTeam;
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
    return { id: docSnap.id, ...docSnap.data() } as FantasyTeam;
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
   * Add a driver to the team
   * V3: Tracks purchasedAtRaceId for hot hand bonus, updates transfer tracking
   */
  async addDriver(
    teamId: string,
    driverId: string,
    currentRaceId?: string
  ): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.lockStatus.canModify) {
      throw new Error('Team is locked and cannot be modified');
    }

    if (team.drivers.length >= TEAM_SIZE) {
      throw new Error(`Team already has ${TEAM_SIZE} drivers`);
    }

    // Check if driver already in team
    if (team.drivers.some((d) => d.driverId === driverId)) {
      throw new Error('Driver already in team');
    }

    // Get driver details
    const driver = await driverService.getDriverById(driverId);
    if (!driver) {
      throw new Error('Driver not found');
    }

    // Check budget
    if (driver.price > team.budget) {
      throw new Error('Not enough budget for this driver');
    }

    const fantasyDriver: FantasyDriver = {
      driverId: driver.id,
      name: driver.name,
      shortName: driver.shortName,
      constructorId: driver.constructorId,
      purchasePrice: driver.price,
      currentPrice: driver.price,
      pointsScored: 0,
      racesHeld: 0,
      purchasedAtRaceId: currentRaceId, // V3: Track for hot hand bonus
    };

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      drivers: [...team.drivers, fantasyDriver],
      budget: team.budget - driver.price,
      totalSpent: team.totalSpent + driver.price,
      // V3: Update transfer tracking
      lastTransferRaceId: currentRaceId || team.lastTransferRaceId,
      racesSinceTransfer: currentRaceId ? 0 : (team.racesSinceTransfer || 0),
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    await this.recordTransaction({
      userId: team.userId,
      leagueId: team.leagueId,
      teamId,
      type: 'buy',
      entityType: 'driver',
      entityId: driver.id,
      entityName: driver.name,
      price: driver.price,
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * Remove a driver from the team
   * V3: Clears ace if removed driver was ace, updates transfer tracking
   */
  async removeDriver(teamId: string, driverId: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.lockStatus.canModify) {
      throw new Error('Team is locked and cannot be modified');
    }

    const driverIndex = team.drivers.findIndex((d) => d.driverId === driverId);
    if (driverIndex === -1) {
      throw new Error('Driver not in team');
    }

    const driver = team.drivers[driverIndex];
    const updatedDrivers = team.drivers.filter((d) => d.driverId !== driverId);

    // Sell at current price minus 5% commission
    const saleValue = calculateSaleValue(driver.currentPrice);

    // V3: Clear ace if removed driver was ace
    const newAceId = team.aceDriverId === driverId ? null : team.aceDriverId;

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      drivers: updatedDrivers,
      budget: team.budget + saleValue,
      totalSpent: team.totalSpent - driver.purchasePrice,
      // V3: Update ace and transfer tracking
      aceDriverId: newAceId,
      racesSinceTransfer: 0,
      updatedAt: serverTimestamp(),
    });

    // Record transaction (record the sale value received)
    await this.recordTransaction({
      userId: team.userId,
      leagueId: team.leagueId,
      teamId,
      type: 'sell',
      entityType: 'driver',
      entityId: driver.driverId,
      entityName: driver.name,
      price: saleValue,
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * Set team constructor
   */
  async setConstructor(teamId: string, constructorId: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.lockStatus.canModify) {
      throw new Error('Team is locked and cannot be modified');
    }

    const constructor = await constructorService.getConstructorById(constructorId);
    if (!constructor) {
      throw new Error('Constructor not found');
    }

    // Calculate budget with previous constructor returned
    let availableBudget = team.budget;
    if (team.constructor) {
      availableBudget += team.constructor.currentPrice;
    }

    if (constructor.price > availableBudget) {
      throw new Error('Not enough budget for this constructor');
    }

    const fantasyConstructor: FantasyConstructor = {
      constructorId: constructor.id,
      name: constructor.name,
      purchasePrice: constructor.price,
      currentPrice: constructor.price,
      pointsScored: 0,
      racesHeld: 0,
    };

    const newBudget = availableBudget - constructor.price;
    const previousCost = team.constructor?.purchasePrice || 0;
    const newTotalSpent = team.totalSpent - previousCost + constructor.price;

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      constructor: fantasyConstructor,
      budget: newBudget,
      totalSpent: newTotalSpent,
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    await this.recordTransaction({
      userId: team.userId,
      leagueId: team.leagueId,
      teamId,
      type: team.constructor ? 'swap' : 'buy',
      entityType: 'constructor',
      entityId: constructor.id,
      entityName: constructor.name,
      price: constructor.price,
      previousEntityId: team.constructor?.constructorId,
      previousEntityName: team.constructor?.name,
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
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
   * Remove constructor from team
   */
  async removeConstructor(teamId: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.lockStatus.canModify) {
      throw new Error('Team is locked and cannot be modified');
    }

    if (!team.constructor) {
      throw new Error('No constructor to remove');
    }

    // Sell at current price minus 5% commission
    const saleValue = calculateSaleValue(team.constructor.currentPrice);
    const constructorName = team.constructor.name;
    const constructorId = team.constructor.constructorId;

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      constructor: null,
      budget: team.budget + saleValue,
      totalSpent: team.totalSpent - team.constructor.purchasePrice,
      updatedAt: serverTimestamp(),
    });

    // Record transaction (record the sale value received)
    await this.recordTransaction({
      userId: team.userId,
      leagueId: team.leagueId,
      teamId,
      type: 'sell',
      entityType: 'constructor',
      entityId: constructorId,
      entityName: constructorName,
      price: saleValue,
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
  },

  /**
   * Swap a driver in the team
   */
  async swapDriver(teamId: string, oldDriverId: string, newDriverId: string): Promise<FantasyTeam> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found');
    }

    if (!team.lockStatus.canModify) {
      throw new Error('Team is locked and cannot be modified');
    }

    const oldDriverIndex = team.drivers.findIndex((d) => d.driverId === oldDriverId);
    if (oldDriverIndex === -1) {
      throw new Error('Driver not in team');
    }

    const newDriver = await driverService.getDriverById(newDriverId);
    if (!newDriver) {
      throw new Error('New driver not found');
    }

    const oldDriver = team.drivers[oldDriverIndex];
    // Sell old driver at current price minus 5% commission
    const saleValue = calculateSaleValue(oldDriver.currentPrice);
    const purchaseCost = newDriver.price;
    const netCost = purchaseCost - saleValue;

    if (netCost > team.budget) {
      throw new Error('Not enough budget for this swap');
    }

    const fantasyDriver: FantasyDriver = {
      driverId: newDriver.id,
      name: newDriver.name,
      shortName: newDriver.shortName,
      constructorId: newDriver.constructorId,
      purchasePrice: newDriver.price,
      currentPrice: newDriver.price,
      pointsScored: 0,
      racesHeld: 0,
      // V3: Track for hot hand bonus (will be set to current race ID in real usage)
    };

    const updatedDrivers = team.drivers.map((d, i) =>
      i === oldDriverIndex ? fantasyDriver : d
    );

    // V3: If swapped driver was ace, clear ace
    const newAceId = team.aceDriverId === oldDriverId ? null : team.aceDriverId;

    const teamRef = doc(db, 'fantasyTeams', teamId);
    await updateDoc(teamRef, {
      drivers: updatedDrivers,
      budget: team.budget - netCost,
      totalSpent: team.totalSpent - oldDriver.purchasePrice + newDriver.price,
      aceDriverId: newAceId,
      // V3: Update transfer tracking
      racesSinceTransfer: 0,
      updatedAt: serverTimestamp(),
    });

    // Record transaction
    await this.recordTransaction({
      userId: team.userId,
      leagueId: team.leagueId,
      teamId,
      type: 'swap',
      entityType: 'driver',
      entityId: newDriver.id,
      entityName: newDriver.name,
      price: newDriver.price,
      previousEntityId: oldDriver.driverId,
      previousEntityName: oldDriver.name,
    });

    return this.getTeamById(teamId) as Promise<FantasyTeam>;
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
   * Sync full team state to Firebase (local-first pattern)
   * Used to push local changes to Firebase in background
   */
  async syncTeam(team: FantasyTeam): Promise<void> {
    const teamRef = doc(db, 'fantasyTeams', team.id);

    // Convert to Firebase-compatible format (remove id, use serverTimestamp)
    // Firebase doesn't accept undefined values, so convert them to null
    const { id, createdAt, updatedAt, ...teamData } = team;

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

    const sanitizedData = sanitizeForFirebase(teamData);

    await setDoc(teamRef, {
      ...sanitizedData,
      createdAt: createdAt instanceof Date && !isNaN(createdAt.getTime())
        ? createdAt
        : (typeof createdAt === 'string' && !isNaN(new Date(createdAt).getTime())
          ? new Date(createdAt)
          : new Date()),
      updatedAt: serverTimestamp(),
    }, { merge: true });
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
