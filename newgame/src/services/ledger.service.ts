import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  addDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LedgerEntry, BagOfCash, Settlement } from '../types';

const ledgerCol = (leagueId: string) => collection(db, 'tl_leagues', leagueId, 'ledger');
const settlementsCol = (leagueId: string) => collection(db, 'tl_leagues', leagueId, 'settlements');

export const ledgerService = {
  // Pledge a buy-in — typically called when joining a league with ledger enabled.
  async pledgeBuyIn(args: {
    leagueId: string;
    userId: string;
    amount: number;
  }): Promise<LedgerEntry> {
    const entry: Omit<LedgerEntry, 'id'> = {
      leagueId: args.leagueId,
      userId: args.userId,
      type: 'buy_in_pledge',
      amount: -Math.abs(args.amount),
      description: `Buy-in: ${args.amount}`,
      status: 'pending',
      createdAt: new Date(),
    };
    const ref = await addDoc(ledgerCol(args.leagueId), { ...entry, createdAt: serverTimestamp() });
    return { id: ref.id, ...entry };
  },

  // Record a payout owed to a member after a race / season-end.
  async recordPayout(args: {
    leagueId: string;
    userId: string;
    amount: number;
    raceId?: string;
    type: 'race_payout' | 'season_payout';
    description: string;
  }): Promise<LedgerEntry> {
    const entry: Omit<LedgerEntry, 'id'> = {
      leagueId: args.leagueId,
      userId: args.userId,
      type: args.type,
      amount: Math.abs(args.amount),
      raceId: args.raceId,
      description: args.description,
      status: 'pending',
      createdAt: new Date(),
    };
    const data: Record<string, unknown> = { ...entry };
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    const ref = await addDoc(ledgerCol(args.leagueId), { ...data, createdAt: serverTimestamp() });
    return { id: ref.id, ...entry };
  },

  async getLedgerForLeague(leagueId: string): Promise<LedgerEntry[]> {
    const snap = await getDocs(query(ledgerCol(leagueId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LedgerEntry[];
  },

  async getLedgerForUser(leagueId: string, userId: string): Promise<LedgerEntry[]> {
    const snap = await getDocs(
      query(ledgerCol(leagueId), where('userId', '==', userId), orderBy('createdAt', 'desc'))
    );
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LedgerEntry[];
  },

  // "Bag of cash" — net of all ledger entries for a user, less confirmed settlements they've already received.
  async computeBag(args: {
    leagueId: string;
    userId: string;
    currencyLabel: string;
  }): Promise<BagOfCash> {
    const entries = await this.getLedgerForUser(args.leagueId, args.userId);
    let net = 0;
    let unsettledOwed = 0;
    let unsettledOwing = 0;
    for (const e of entries) {
      net += e.amount;
      if (e.status === 'pending') {
        if (e.amount > 0) unsettledOwed += e.amount;
        else unsettledOwing += -e.amount;
      }
    }
    // Subtract confirmed settlements where this user received money (offsets owed) or sent (offsets owing).
    const settlements = await getDocs(
      query(settlementsCol(args.leagueId), where('toUserId', '==', args.userId), where('status', '==', 'settled'))
    );
    let received = 0;
    settlements.forEach((s) => {
      received += (s.data() as Settlement).amount;
    });
    const settlementsSent = await getDocs(
      query(settlementsCol(args.leagueId), where('fromUserId', '==', args.userId), where('status', '==', 'settled'))
    );
    let sent = 0;
    settlementsSent.forEach((s) => {
      sent += (s.data() as Settlement).amount;
    });

    return {
      leagueId: args.leagueId,
      userId: args.userId,
      net: net - received + sent,
      currencyLabel: args.currencyLabel,
      unsettledOwed: Math.max(unsettledOwed - received, 0),
      unsettledOwing: Math.max(unsettledOwing - sent, 0),
    };
  },

  // Settlement: from-user marks it sent, to-user confirms received.
  async createSettlement(args: {
    leagueId: string;
    fromUserId: string;
    fromDisplayName: string;
    toUserId: string;
    toDisplayName: string;
    amount: number;
    externalNote?: string;
  }): Promise<Settlement> {
    const data: Omit<Settlement, 'id'> = {
      leagueId: args.leagueId,
      fromUserId: args.fromUserId,
      fromDisplayName: args.fromDisplayName,
      toUserId: args.toUserId,
      toDisplayName: args.toDisplayName,
      amount: args.amount,
      externalNote: args.externalNote,
      markedPaidByFromAt: new Date(),
      status: 'awaiting_confirmation',
      createdAt: new Date(),
    };
    const payload: Record<string, unknown> = { ...data };
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];
    const ref = await addDoc(settlementsCol(args.leagueId), {
      ...payload,
      markedPaidByFromAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    return { id: ref.id, ...data };
  },

  async confirmSettlement(leagueId: string, settlementId: string): Promise<void> {
    await updateDoc(doc(settlementsCol(leagueId), settlementId), {
      confirmedByToAt: serverTimestamp(),
      status: 'settled',
    });
  },

  async disputeSettlement(leagueId: string, settlementId: string): Promise<void> {
    await updateDoc(doc(settlementsCol(leagueId), settlementId), {
      status: 'disputed',
    });
  },

  // Commissioner override — resolves a stuck/disputed settlement by either marking
  // it as settled (e.g. they verified offline) or canceling it (refund-equivalent).
  async resolveSettlementAsCommissioner(
    leagueId: string,
    settlementId: string,
    resolution: 'settled' | 'canceled'
  ): Promise<void> {
    if (resolution === 'canceled') {
      // Canceling deletes the record so it stops affecting bags.
      await updateDoc(doc(settlementsCol(leagueId), settlementId), {
        status: 'canceled',
      });
      return;
    }
    await updateDoc(doc(settlementsCol(leagueId), settlementId), {
      status: 'settled',
      confirmedByToAt: serverTimestamp(),
    });
  },

  async getSettlementsForLeague(leagueId: string): Promise<Settlement[]> {
    const snap = await getDocs(query(settlementsCol(leagueId), orderBy('createdAt', 'desc')));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Settlement[];
  },

  async getSettlementsForUser(leagueId: string, userId: string): Promise<{ outgoing: Settlement[]; incoming: Settlement[] }> {
    const all = await this.getSettlementsForLeague(leagueId);
    return {
      outgoing: all.filter((s) => s.fromUserId === userId),
      incoming: all.filter((s) => s.toUserId === userId),
    };
  },

  // Compute bags for every member at once. Used by the settle-up screen so it
  // can build the minimum-transfer plan in one pass without N round-trips.
  async computeBagsForAllMembers(args: {
    leagueId: string;
    members: { userId: string; displayName: string }[];
    currencyLabel: string;
  }): Promise<(BagOfCash & { displayName: string })[]> {
    const allEntries = await this.getLedgerForLeague(args.leagueId);
    const allSettlements = await this.getSettlementsForLeague(args.leagueId);
    const settled = allSettlements.filter((s) => s.status === 'settled');

    return args.members.map((m) => {
      const entries = allEntries.filter((e) => e.userId === m.userId);
      let net = 0;
      let unsettledOwed = 0;
      let unsettledOwing = 0;
      for (const e of entries) {
        net += e.amount;
        if (e.status === 'pending') {
          if (e.amount > 0) unsettledOwed += e.amount;
          else unsettledOwing += -e.amount;
        }
      }
      const received = settled
        .filter((s) => s.toUserId === m.userId)
        .reduce((sum, s) => sum + s.amount, 0);
      const sent = settled
        .filter((s) => s.fromUserId === m.userId)
        .reduce((sum, s) => sum + s.amount, 0);

      return {
        leagueId: args.leagueId,
        userId: m.userId,
        displayName: m.displayName,
        net: net - received + sent,
        currencyLabel: args.currencyLabel,
        unsettledOwed: Math.max(unsettledOwed - received, 0),
        unsettledOwing: Math.max(unsettledOwing - sent, 0),
      };
    });
  },

  // Cash leaderboard — sorts members by net cash flow (winnings minus losses).
  // For "biggest earner" / "biggest loser" filters on League Detail.
  cashLeaderboard(
    bags: (BagOfCash & { displayName: string })[]
  ): (BagOfCash & { displayName: string; rank: number })[] {
    return [...bags]
      .sort((a, b) => b.net - a.net)
      .map((b, i) => ({ ...b, rank: i + 1 }));
  },

  // Splitwise-style: given a list of net positions, compute the minimum set of transfers.
  // Pure function — easy to unit test.
  computeSettleUpPlan(
    positions: { userId: string; displayName: string; net: number }[]
  ): { fromUserId: string; fromDisplayName: string; toUserId: string; toDisplayName: string; amount: number }[] {
    // Round to integers (cents/dollars) to avoid floating drift.
    const owe = positions.filter((p) => p.net < 0).map((p) => ({ ...p, remaining: -p.net }));
    const owed = positions.filter((p) => p.net > 0).map((p) => ({ ...p, remaining: p.net }));
    const transfers: { fromUserId: string; fromDisplayName: string; toUserId: string; toDisplayName: string; amount: number }[] = [];
    let i = 0;
    let j = 0;
    while (i < owe.length && j < owed.length) {
      const debtor = owe[i];
      const creditor = owed[j];
      const amount = Math.min(debtor.remaining, creditor.remaining);
      if (amount > 0) {
        transfers.push({
          fromUserId: debtor.userId,
          fromDisplayName: debtor.displayName,
          toUserId: creditor.userId,
          toDisplayName: creditor.displayName,
          amount,
        });
        debtor.remaining -= amount;
        creditor.remaining -= amount;
      }
      if (debtor.remaining === 0) i++;
      if (creditor.remaining === 0) j++;
    }
    return transfers;
  },
};
