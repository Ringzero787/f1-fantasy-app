// Bets service — Pole bet (pre-quali) + League winner bet (pre-race).
// Cash-only. Does NOT produce points.
//
// Pole bet odds: A=2x, B=5x, C=15x (from game-rules.md §9.1)
// League winner odds: = league size (uniform-skill break-even)
// Stake cap: 25% of bankroll per bet, 1 bet per market per weekend.
// Settled by tlOnRaceCompleted Cloud Function.

import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { garageService } from './garage.service';
import type { RaceBets, Driver, LeagueMember, League } from '../types';

const STAKE_MAX_PCT = 0.25;
const POLE_ODDS: Record<'A' | 'B' | 'C', number> = { A: 2, B: 5, C: 15 };

const betsDoc = (userId: string, raceId: string) => doc(db, 'tl_bets', `${userId}_${raceId}`);
const garageDoc = (userId: string) => doc(db, 'tl_garages', userId);

export const betsService = {
  poleOddsForTier(tier: 'A' | 'B' | 'C'): number {
    return POLE_ODDS[tier];
  },

  async getForRace(userId: string, raceId: string): Promise<RaceBets | null> {
    const snap = await getDoc(betsDoc(userId, raceId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as RaceBets;
  },

  validateStake(stake: number, bankroll: number): string | null {
    if (!Number.isFinite(stake) || stake <= 0) return 'Stake must be positive';
    if (stake > bankroll) return 'Stake exceeds bankroll';
    const cap = Math.floor(bankroll * STAKE_MAX_PCT);
    if (stake > cap) return `Stake exceeds 25% cap ($${cap})`;
    return null;
  },

  async placePoleBet(args: {
    userId: string;
    raceId: string;
    driver: Driver;
    stake: number;
  }): Promise<{ stake: number; odds: number; payoutIfWin: number; cashAfter: number }> {
    const odds = POLE_ODDS[args.driver.tier];
    const payoutIfWin = Math.round(args.stake * odds);

    const result = await runTransaction(db, async (tx) => {
      const garageSnap = await tx.get(garageDoc(args.userId));
      if (!garageSnap.exists()) throw new Error('Garage not found');
      const cash = (garageSnap.data()?.cash as number | undefined) ?? 0;
      const validation = this.validateStake(args.stake, cash);
      if (validation) throw new Error(validation);

      const betsSnap = await tx.get(betsDoc(args.userId, args.raceId));
      const existing = betsSnap.exists() ? (betsSnap.data() as Omit<RaceBets, 'id'>) : null;
      if (existing?.poleBet?.settled) throw new Error('Pole bet already settled');

      // Refund existing unsettled pole bet stake before placing new
      const oldStake = existing?.poleBet?.stake ?? 0;
      const newCash = cash - args.stake + oldStake;

      const newPole = {
        driverId: args.driver.id,
        driverName: args.driver.name,
        driverShort: args.driver.shortName,
        driverTier: args.driver.tier,
        stake: args.stake,
        odds,
        payoutIfWin,
        placedAt: new Date(),
      };

      const totalStaked = (existing?.leagueBet?.stake ?? 0) + args.stake;

      tx.set(
        betsDoc(args.userId, args.raceId),
        {
          userId: args.userId,
          raceId: args.raceId,
          poleBet: newPole,
          leagueBet: existing?.leagueBet,
          totalStaked,
          createdAt: existing ? existing.createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.update(garageDoc(args.userId), { cash: newCash, updatedAt: serverTimestamp() });

      return { stake: args.stake, odds, payoutIfWin, cashAfter: newCash };
    });

    await garageService.recordTransaction(args.userId, {
      type: 'reroll',
      delta: -result.stake,
      cashAfter: result.cashAfter,
      entityId: args.driver.id,
      entityName: args.driver.name,
      raceId: args.raceId,
      description: `Pole bet · ${args.driver.name} @ ${odds}x`,
    });
    return result;
  },

  async placeLeagueBet(args: {
    userId: string;
    raceId: string;
    target: LeagueMember;
    league: League;
    stake: number;
  }): Promise<{ stake: number; odds: number; payoutIfWin: number; cashAfter: number }> {
    const odds = args.league.memberCount;
    const payoutIfWin = Math.round(args.stake * odds);

    if (args.target.userId === args.userId) {
      throw new Error('Cannot bet on yourself');
    }

    const result = await runTransaction(db, async (tx) => {
      const garageSnap = await tx.get(garageDoc(args.userId));
      const cash = (garageSnap.data()?.cash as number | undefined) ?? 0;
      const validation = this.validateStake(args.stake, cash);
      if (validation) throw new Error(validation);

      const betsSnap = await tx.get(betsDoc(args.userId, args.raceId));
      const existing = betsSnap.exists() ? (betsSnap.data() as Omit<RaceBets, 'id'>) : null;
      if (existing?.leagueBet?.settled) throw new Error('League bet already settled');

      const oldStake = existing?.leagueBet?.stake ?? 0;
      const newCash = cash - args.stake + oldStake;

      const newLeague = {
        targetUserId: args.target.userId,
        targetDisplayName: args.target.displayName,
        leagueId: args.league.id,
        leagueName: args.league.name,
        stake: args.stake,
        odds,
        payoutIfWin,
        placedAt: new Date(),
      };

      const totalStaked = (existing?.poleBet?.stake ?? 0) + args.stake;

      tx.set(
        betsDoc(args.userId, args.raceId),
        {
          userId: args.userId,
          raceId: args.raceId,
          poleBet: existing?.poleBet,
          leagueBet: newLeague,
          totalStaked,
          createdAt: existing ? existing.createdAt : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.update(garageDoc(args.userId), { cash: newCash, updatedAt: serverTimestamp() });

      return { stake: args.stake, odds, payoutIfWin, cashAfter: newCash };
    });

    await garageService.recordTransaction(args.userId, {
      type: 'reroll',
      delta: -result.stake,
      cashAfter: result.cashAfter,
      raceId: args.raceId,
      description: `League bet · ${args.target.displayName} @ ${odds}x`,
    });
    return result;
  },

  async cancelPoleBet(args: { userId: string; raceId: string }): Promise<{ refund: number; cashAfter: number }> {
    return this.cancelBet(args.userId, args.raceId, 'poleBet');
  },

  async cancelLeagueBet(args: { userId: string; raceId: string }): Promise<{ refund: number; cashAfter: number }> {
    return this.cancelBet(args.userId, args.raceId, 'leagueBet');
  },

  async cancelBet(userId: string, raceId: string, slot: 'poleBet' | 'leagueBet'): Promise<{ refund: number; cashAfter: number }> {
    const result = await runTransaction(db, async (tx) => {
      const betsSnap = await tx.get(betsDoc(userId, raceId));
      if (!betsSnap.exists()) return { refund: 0, cashAfter: 0 };
      const data = betsSnap.data() as Omit<RaceBets, 'id'>;
      const bet = data[slot];
      if (!bet || bet.settled) return { refund: 0, cashAfter: 0 };

      // 80% refund
      const refund = Math.round(bet.stake * 0.8);

      const garageSnap = await tx.get(garageDoc(userId));
      const cash = (garageSnap.data()?.cash as number | undefined) ?? 0;
      const newCash = cash + refund;

      const remaining = { ...data, [slot]: undefined };
      const totalStaked = (remaining.poleBet?.stake ?? 0) + (remaining.leagueBet?.stake ?? 0);

      if (!remaining.poleBet && !remaining.leagueBet) {
        tx.delete(betsDoc(userId, raceId));
      } else {
        tx.update(betsDoc(userId, raceId), {
          [slot]: deleteField(),
          totalStaked,
          updatedAt: serverTimestamp(),
        });
      }
      tx.update(garageDoc(userId), { cash: newCash, updatedAt: serverTimestamp() });
      return { refund, cashAfter: newCash };
    });

    if (result.refund > 0) {
      await garageService.recordTransaction(userId, {
        type: 'release_driver',
        delta: result.refund,
        cashAfter: result.cashAfter,
        raceId,
        description: `Cancelled ${slot === 'poleBet' ? 'pole' : 'league'} bet · 80% refund`,
      });
    }
    return result;
  },
};

export const betsConfig = { STAKE_MAX_PCT, POLE_ODDS };
