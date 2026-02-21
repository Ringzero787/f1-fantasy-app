import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  Race,
  RaceSchedule,
  RaceResults,
} from '../types';

const racesCollection = collection(db, 'races');

export const raceService = {
  /**
   * Get all races for a season
   */
  async getSeasonRaces(seasonId: string): Promise<Race[]> {
    const q = query(
      racesCollection,
      where('seasonId', '==', seasonId),
      orderBy('round', 'asc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      schedule: this.parseScheduleDates(docSnap.data().schedule),
    })) as Race[];
  },

  /**
   * Get race by ID
   */
  async getRaceById(raceId: string): Promise<Race | null> {
    const docRef = doc(db, 'races', raceId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      schedule: this.parseScheduleDates(data?.schedule),
    } as Race;
  },

  /**
   * Get next upcoming race
   */
  async getNextRace(seasonId: string): Promise<Race | null> {
    const q = query(
      racesCollection,
      where('seasonId', '==', seasonId),
      where('status', '==', 'upcoming'),
      orderBy('round', 'asc'),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    return {
      id: docSnap.id,
      ...docSnap.data(),
      schedule: this.parseScheduleDates(docSnap.data().schedule),
    } as Race;
  },

  /**
   * Get current race (in progress)
   */
  async getCurrentRace(seasonId: string): Promise<Race | null> {
    const q = query(
      racesCollection,
      where('seasonId', '==', seasonId),
      where('status', '==', 'in_progress'),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    return {
      id: docSnap.id,
      ...docSnap.data(),
      schedule: this.parseScheduleDates(docSnap.data().schedule),
    } as Race;
  },

  /**
   * Get completed races
   */
  async getCompletedRaces(seasonId: string): Promise<Race[]> {
    const q = query(
      racesCollection,
      where('seasonId', '==', seasonId),
      where('status', '==', 'completed'),
      orderBy('round', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
      schedule: this.parseScheduleDates(docSnap.data().schedule),
    })) as Race[];
  },

  /**
   * Get race results
   */
  async getRaceResults(raceId: string): Promise<RaceResults | null> {
    const race = await this.getRaceById(raceId);
    return race?.results || null;
  },

  /**
   * Update race status
   */
  async updateRaceStatus(
    raceId: string,
    status: Race['status']
  ): Promise<void> {
    const docRef = doc(db, 'races', raceId);
    await updateDoc(docRef, { status });
  },

  /**
   * Set race results (initial publish — sets status to 'completed', triggering onRaceCompleted)
   */
  async setRaceResults(raceId: string, results: RaceResults): Promise<void> {
    const docRef = doc(db, 'races', raceId);
    await updateDoc(docRef, {
      results: {
        ...results,
        processedAt: serverTimestamp(),
      },
      status: 'completed',
    });
  },

  /**
   * Update race results only (for corrections to already-completed races).
   * Does NOT change status — use calculatePointsManually to re-trigger scoring.
   */
  async updateRaceResults(raceId: string, results: RaceResults): Promise<void> {
    const docRef = doc(db, 'races', raceId);
    await updateDoc(docRef, {
      results: {
        ...results,
        processedAt: serverTimestamp(),
      },
    });
  },

  /**
   * Check if team should be locked (qualifying started)
   */
  isLockTime(race: Race): boolean {
    const now = new Date();
    return now >= race.schedule.qualifying;
  },

  /**
   * Check if team should be unlocked (race finished)
   */
  isUnlockTime(race: Race): boolean {
    const now = new Date();
    // Unlock 2 hours after race start (approximation for race end)
    const raceEndApprox = new Date(race.schedule.race.getTime() + 2 * 60 * 60 * 1000);
    return now >= raceEndApprox && race.status === 'completed';
  },

  /**
   * Get time until lock
   */
  getTimeUntilLock(race: Race): number {
    const now = new Date();
    return race.schedule.qualifying.getTime() - now.getTime();
  },

  /**
   * Get countdown info for a race
   */
  getRaceCountdown(race: Race): {
    nextSession: string;
    nextSessionTime: Date;
    timeUntil: number;
  } | null {
    const now = new Date();
    const sessions = [
      { name: 'FP1', time: race.schedule.fp1 },
      { name: 'FP2', time: race.schedule.fp2 },
      { name: 'FP3', time: race.schedule.fp3 },
      { name: 'Sprint Qualifying', time: race.schedule.sprintQualifying },
      { name: 'Sprint', time: race.schedule.sprint },
      { name: 'Qualifying', time: race.schedule.qualifying },
      { name: 'Race', time: race.schedule.race },
    ].filter((s) => s.time);

    for (const session of sessions) {
      if (session.time && session.time > now) {
        return {
          nextSession: session.name,
          nextSessionTime: session.time,
          timeUntil: session.time.getTime() - now.getTime(),
        };
      }
    }

    return null;
  },

  /**
   * Parse schedule dates from Firestore timestamps.
   * Handles: Firestore Timestamp objects, serialized {seconds, nanoseconds}, ISO strings, and epoch ms.
   */
  parseScheduleDates(schedule: any): RaceSchedule {
    if (!schedule) {
      return {} as RaceSchedule;
    }

    const toSafeDate = (val: any): Date | undefined => {
      if (!val) return undefined;
      if (val.toDate) return val.toDate(); // Firestore Timestamp
      if (typeof val.seconds === 'number') return new Date(val.seconds * 1000); // Serialized Timestamp
      const d = new Date(val);
      return isNaN(d.getTime()) ? undefined : d;
    };

    return {
      fp1: toSafeDate(schedule.fp1) || new Date(),
      fp2: toSafeDate(schedule.fp2),
      fp3: toSafeDate(schedule.fp3),
      sprintQualifying: toSafeDate(schedule.sprintQualifying),
      sprint: toSafeDate(schedule.sprint),
      qualifying: toSafeDate(schedule.qualifying) || new Date(),
      race: toSafeDate(schedule.race) || new Date(),
    };
  },

};
