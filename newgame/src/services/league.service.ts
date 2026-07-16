import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  runTransaction,
  addDoc,
  increment,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { withOfflineFallback, throwIfOfflineEmpty } from '../utils/offlineCache';
import type { League, LeagueLedgerConfig, LeagueMember } from '../types';

const leaguesCol = collection(db, 'tl_leagues');
const membersCol = (leagueId: string) => collection(db, 'tl_leagues', leagueId, 'members');

const generateInviteCode = () => {
  // 6-char base32 (no ambiguous I/O/0/1)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

export const leagueService = {
  async createLeague(args: {
    name: string;
    description?: string;
    ownerId: string;
    ownerName: string;
    seasonId: string;
    isPublic?: boolean;
    ledger: LeagueLedgerConfig;
  }): Promise<League> {
    const inviteCode = generateInviteCode();

    const leagueRef = doc(leaguesCol);
    const league: Omit<League, 'id'> = {
      name: args.name,
      description: args.description,
      ownerId: args.ownerId,
      ownerName: args.ownerName,
      inviteCode,
      memberCount: 1,
      maxMembers: 8,
      seasonId: args.seasonId,
      isPublic: args.isPublic ?? false,
      ledger: args.ledger,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const data: Record<string, unknown> = { ...league };
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

    await setDoc(leagueRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Add owner as a member.
    await setDoc(doc(membersCol(leagueRef.id), args.ownerId), {
      leagueId: leagueRef.id,
      userId: args.ownerId,
      displayName: args.ownerName ?? 'Player',
      totalPoints: 0,
      raceWins: 0,
      rank: 1,
      joinedAt: serverTimestamp(),
    });

    return { id: leagueRef.id, ...league };
  },

  async getLeague(id: string): Promise<League | null> {
    return withOfflineFallback(`league:${id}`, async () => {
      const snap = await getDoc(doc(leaguesCol, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as League;
    });
  },

  async getMyLeagues(userId: string): Promise<League[]> {
    return withOfflineFallback(`myLeagues:${userId}`, () => this._getMyLeaguesLive(userId));
  },

  async _getMyLeaguesLive(userId: string): Promise<League[]> {
    const { collectionGroup } = await import('firebase/firestore');
    const memberDocs = await getDocs(
      query(collectionGroup(db, 'members'), where('userId', '==', userId))
    );
    throwIfOfflineEmpty(memberDocs);
    const memberLeagueIds = memberDocs.docs
      .map((d) => d.ref.parent.parent?.id)
      .filter((id): id is string => !!id);

    const ownedSnap = await getDocs(query(leaguesCol, where('ownerId', '==', userId)));
    const ownedIds = ownedSnap.docs.map((d) => d.id);

    const allIds = Array.from(new Set([...ownedIds, ...memberLeagueIds]));
    const leagues: League[] = [];
    for (const id of allIds) {
      const l = await this.getLeague(id);
      if (l) leagues.push(l);
    }
    leagues.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return leagues;
  },

  async joinByInviteCode(args: {
    inviteCode: string;
    userId: string;
    displayName: string;
  }): Promise<League> {
    const q = query(leaguesCol, where('inviteCode', '==', args.inviteCode.toUpperCase()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('Invalid invite code');

    const leagueDoc = snap.docs[0];
    const league = { id: leagueDoc.id, ...leagueDoc.data() } as League;

    // Add as member if not already in.
    const memberRef = doc(membersCol(league.id), args.userId);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) return league;

    if (league.memberCount >= league.maxMembers) {
      throw new Error(`League is full (${league.maxMembers} members)`);
    }

    await runTransaction(db, async (tx) => {
      tx.set(memberRef, {
        leagueId: league.id,
        userId: args.userId,
        displayName: args.displayName ?? 'Player',
        totalPoints: 0,
        raceWins: 0,
        rank: league.memberCount + 1,
        joinedAt: serverTimestamp(),
      });
      tx.update(doc(leaguesCol, league.id), {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    });

    // Auto-pledge buy-in if league has ledger enabled. Done outside the transaction
    // because it's a side effect — if it fails, the user is still in the league and
    // can pledge manually from the league screen.
    if (league.ledger?.enabled && league.ledger.buyInAmount > 0) {
      try {
        const { ledgerService } = await import('./ledger.service');
        await ledgerService.pledgeBuyIn({
          leagueId: league.id,
          userId: args.userId,
          amount: league.ledger.buyInAmount,
        });
      } catch (err) {
        console.warn('[tl] auto-pledge failed; member can pledge manually:', err);
      }
    }

    return { ...league, memberCount: league.memberCount + 1 };
  },

  async leaveLeague(leagueId: string, userId: string): Promise<void> {
    await runTransaction(db, async (tx) => {
      const leagueRef = doc(leaguesCol, leagueId);
      const memberRef = doc(membersCol(leagueId), userId);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists()) return;
      tx.delete(memberRef);
      tx.update(leagueRef, {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    });
  },

  async getMembers(leagueId: string): Promise<LeagueMember[]> {
    return withOfflineFallback(`leagueMembers:${leagueId}`, async () => {
      const snap = await getDocs(query(membersCol(leagueId), orderBy('totalPoints', 'desc')));
      throwIfOfflineEmpty(snap);
      return snap.docs.map((d, i) => ({ id: d.id, ...d.data(), rank: i + 1 })) as LeagueMember[];
    });
  },

  // Browse public leagues. Used by the Leagues tab search/browse list. Returns
  // leagues where isPublic === true, optionally filtered by a fuzzy name match.
  // Caps the result to keep the page snappy.
  async browsePublic(args: { search?: string; limit?: number } = {}): Promise<League[]> {
    const max = args.limit ?? 50;
    const snap = await getDocs(query(leaguesCol, where('isPublic', '==', true)));
    const leagues = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as League);
    const needle = (args.search || '').trim().toLowerCase();
    const filtered = needle
      ? leagues.filter((l) =>
          (l.name || '').toLowerCase().includes(needle) ||
          (l.description || '').toLowerCase().includes(needle) ||
          (l.ownerName || '').toLowerCase().includes(needle)
        )
      : leagues;
    filtered.sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));
    return filtered.slice(0, max);
  },

  // Public-league join shortcut. Same membership add as joinByInviteCode but
  // gated on the league actually being public.
  async joinPublic(args: { leagueId: string; userId: string; displayName: string }): Promise<League> {
    const league = await this.getLeague(args.leagueId);
    if (!league) throw new Error('League not found');
    if (!league.isPublic) throw new Error('This league is invite-only');
    if (league.memberCount >= league.maxMembers) {
      throw new Error(`League is full (${league.maxMembers} members)`);
    }
    const memberRef = doc(membersCol(league.id), args.userId);
    const memberSnap = await getDoc(memberRef);
    if (memberSnap.exists()) return league;
    await runTransaction(db, async (tx) => {
      tx.set(memberRef, {
        leagueId: league.id,
        userId: args.userId,
        displayName: args.displayName ?? 'Player',
        totalPoints: 0,
        raceWins: 0,
        rank: league.memberCount + 1,
        joinedAt: serverTimestamp(),
      });
      tx.update(doc(leaguesCol, league.id), {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    });
    if (league.ledger?.enabled && league.ledger.buyInAmount > 0) {
      try {
        const { ledgerService } = await import('./ledger.service');
        await ledgerService.pledgeBuyIn({
          leagueId: league.id,
          userId: args.userId,
          amount: league.ledger.buyInAmount,
        });
      } catch (err) {
        console.warn('[tl] auto-pledge failed:', err);
      }
    }
    return { ...league, memberCount: league.memberCount + 1 };
  },

  // Enriched standings: members + their season scores (totalCash, callsCorrect,
  // callsTotal) joined for the new league detail page. Falls back gracefully
  // when a member has no season score doc yet (no settled weekends).
  async getStandings(args: {
    leagueId: string;
    seasonId: string;
  }): Promise<Array<LeagueMember & { totalCash: number; callsCorrect: number; callsTotal: number }>> {
    const { leagueId, seasonId } = args;
    const members = await this.getMembers(leagueId);
    const enriched = await Promise.all(
      members.map(async (m) => {
        const ssRef = doc(db, 'tl_season_scores', `${m.userId}_${seasonId}`);
        const ss = await getDoc(ssRef);
        const data = ss.exists() ? (ss.data() as { totalCash?: number; callsCorrect?: number; callsTotal?: number; totalPoints?: number }) : null;
        return {
          ...m,
          totalCash: data?.totalCash ?? 0,
          callsCorrect: data?.callsCorrect ?? 0,
          callsTotal: data?.callsTotal ?? 0,
          // Prefer season-scores points (settlement-driven) over the member doc.
          totalPoints: data?.totalPoints ?? m.totalPoints,
        };
      })
    );
    return enriched;
  },

  async deleteLeague(leagueId: string): Promise<void> {
    // Best-effort: delete members + ledger then league. Production version should be a Cloud Function.
    const members = await getDocs(membersCol(leagueId));
    for (const m of members.docs) await deleteDoc(m.ref);
    await deleteDoc(doc(leaguesCol, leagueId));
  },

  // Admin: flip a league's public flag (search visibility + open-join).
  async setLeaguePublic(leagueId: string, isPublic: boolean): Promise<void> {
    await runTransaction(db, async (tx) => {
      const ref = doc(leaguesCol, leagueId);
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('League not found');
      tx.update(ref, {
        isPublic,
        updatedAt: serverTimestamp(),
      });
    });
  },

  // Admin: kick a member. Decrements memberCount, removes the member doc.
  // Caller (the UI) is responsible for confirming + checking ownership; we
  // verify here too in case it's called from elsewhere.
  async removeMember(args: { leagueId: string; targetUserId: string; requestedBy: string }): Promise<void> {
    const { leagueId, targetUserId, requestedBy } = args;
    await runTransaction(db, async (tx) => {
      const leagueRef = doc(leaguesCol, leagueId);
      const leagueSnap = await tx.get(leagueRef);
      if (!leagueSnap.exists()) throw new Error('League not found');
      const league = leagueSnap.data() as League;
      if (league.ownerId !== requestedBy) throw new Error('Only the commissioner can remove members');
      if (league.ownerId === targetUserId) throw new Error('The commissioner cannot be removed — delete the league instead');
      const memberRef = doc(membersCol(leagueId), targetUserId);
      const memberSnap = await tx.get(memberRef);
      if (!memberSnap.exists()) return;
      tx.delete(memberRef);
      tx.update(leagueRef, {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    });
  },
};
