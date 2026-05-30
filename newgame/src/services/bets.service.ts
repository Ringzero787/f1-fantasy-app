// Bets service — Pole bet (pre-quali) + League winner bet (pre-race).
// Cash-only. Does NOT produce points.
//
// All cash-moving operations are server-authoritative Cloud Function callables
// (functions/src/economy/betCallables.ts) — odds (pole: driver tier; league:
// member count) and the 25% stake cap are enforced server-side. The methods
// below keep their old signatures so the bet sheets are unchanged; they
// delegate to the callable. The constants here are kept for client-side
// previews only (payout-if-win, "max stake") and are NOT authoritative.

import { doc, getDoc } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';
import type { RaceBets, Driver, LeagueMember, League } from '../types';

const STAKE_MAX_PCT = 0.25;
const POLE_ODDS: Record<'A' | 'B' | 'C', number> = { A: 2, B: 5, C: 15 };

const betsDoc = (userId: string, raceId: string) => doc(db, 'tl_bets', `${userId}_${raceId}`);

const callPlacePoleBet = httpsCallable(functions, 'tlPlacePoleBet');
const callPlaceLeagueBet = httpsCallable(functions, 'tlPlaceLeagueBet');
const callCancelBet = httpsCallable(functions, 'tlCancelBet');

type PlaceResult = { stake: number; odds: number; payoutIfWin: number; cashAfter: number };
type CancelResult = { refund: number; cashAfter: number };

export const betsService = {
  poleOddsForTier(tier: 'A' | 'B' | 'C'): number {
    return POLE_ODDS[tier];
  },

  async getForRace(userId: string, raceId: string): Promise<RaceBets | null> {
    const snap = await getDoc(betsDoc(userId, raceId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as RaceBets;
  },

  // Client-side preview validation only — the server re-validates authoritatively.
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
  }): Promise<PlaceResult> {
    const r = await callPlacePoleBet({ raceId: args.raceId, driverId: args.driver.id, stake: args.stake });
    return r.data as PlaceResult;
  },

  async placeLeagueBet(args: {
    userId: string;
    raceId: string;
    target: LeagueMember;
    league: League;
    stake: number;
  }): Promise<PlaceResult> {
    const r = await callPlaceLeagueBet({
      raceId: args.raceId,
      leagueId: args.league.id,
      targetUserId: args.target.userId,
      stake: args.stake,
    });
    return r.data as PlaceResult;
  },

  async cancelPoleBet(args: { userId: string; raceId: string }): Promise<CancelResult> {
    return this.cancelBet(args.userId, args.raceId, 'poleBet');
  },

  async cancelLeagueBet(args: { userId: string; raceId: string }): Promise<CancelResult> {
    return this.cancelBet(args.userId, args.raceId, 'leagueBet');
  },

  async cancelBet(userId: string, raceId: string, slot: 'poleBet' | 'leagueBet'): Promise<CancelResult> {
    const r = await callCancelBet({ raceId, slot });
    return r.data as CancelResult;
  },
};

export const betsConfig = { STAKE_MAX_PCT, POLE_ODDS };
