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
      displayName: args.ownerName,
      totalPoints: 0,
      raceWins: 0,
      rank: 1,
      joinedAt: serverTimestamp(),
    });

    return { id: leagueRef.id, ...league };
  },

  async getLeague(id: string): Promise<League | null> {
    const snap = await getDoc(doc(leaguesCol, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as League;
  },

  async getMyLeagues(userId: string): Promise<League[]> {
    const { collectionGroup } = await import('firebase/firestore');
    const memberDocs = await getDocs(
      query(collectionGroup(db, 'members'), where('userId', '==', userId))
    );
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
        displayName: args.displayName,
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
    const snap = await getDocs(query(membersCol(leagueId), orderBy('totalPoints', 'desc')));
    return snap.docs.map((d, i) => ({ id: d.id, ...d.data(), rank: i + 1 })) as LeagueMember[];
  },

  async deleteLeague(leagueId: string): Promise<void> {
    // Best-effort: delete members + ledger then league. Production version should be a Cloud Function.
    const members = await getDocs(membersCol(leagueId));
    for (const m of members.docs) await deleteDoc(m.ref);
    await deleteDoc(doc(leaguesCol, leagueId));
  },
};
