import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  collectionGroup,
  serverTimestamp,
  increment,
  writeBatch,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  INVITE_CODE_LENGTH,
  INVITE_EXPIRY_DAYS,
  DEFAULT_MAX_MEMBERS,
  RACE_POINTS,
  SPRINT_POINTS,
  FASTEST_LAP_BONUS,
  POSITION_GAINED_BONUS,
} from '../config/constants';
import * as Crypto from 'expo-crypto';
import type {
  League,
  LeagueMember,
  LeagueInvite,
  LeagueSettings,
  CreateLeagueForm,
} from '../types';

// Default league settings
const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  allowLateJoin: true,
  lockDeadline: 'qualifying',
  scoringRules: {
    racePoints: RACE_POINTS,
    sprintPoints: SPRINT_POINTS,
    fastestLapBonus: FASTEST_LAP_BONUS,
    positionGainedBonus: POSITION_GAINED_BONUS,
    qualifyingPoints: [],
    dnfPenalty: 0,
    dsqPenalty: -5,
  },
};

/**
 * Generate a cryptographically secure random invite code
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const randomBytes = new Uint8Array(INVITE_CODE_LENGTH);
  Crypto.getRandomValues(randomBytes);
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars.charAt(randomBytes[i] % chars.length);
  }
  return code;
}

const leaguesCollection = collection(db, 'leagues');

export const leagueService = {
  /**
   * Create a new league
   */
  async createLeague(
    userId: string,
    userName: string,
    data: CreateLeagueForm,
    seasonId: string
  ): Promise<League> {
    // Check for duplicate league name globally
    const nameQuery = query(
      leaguesCollection,
      where('name', '==', data.name),
      limit(1)
    );
    const nameSnapshot = await getDocs(nameQuery);
    if (!nameSnapshot.empty) {
      throw new Error('A league with this name already exists');
    }

    const inviteCode = generateInviteCode();

    const leagueData = {
      name: data.name,
      description: data.description || null,
      ownerId: userId,
      ownerName: userName,
      inviteCode,
      isPublic: data.isPublic,
      maxMembers: data.maxMembers || DEFAULT_MAX_MEMBERS,
      memberCount: 1,
      seasonId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      settings: DEFAULT_LEAGUE_SETTINGS,
    };

    // Create league document
    const leagueRef = await addDoc(leaguesCollection, leagueData);

    // Add owner as first member
    const memberRef = doc(db, 'leagues', leagueRef.id, 'members', userId);
    await setDoc(memberRef, {
      leagueId: leagueRef.id,
      userId,
      displayName: userName,
      role: 'owner',
      totalPoints: 0,
      rank: 1,
      joinedAt: serverTimestamp(),
    });

    return {
      id: leagueRef.id,
      ...data,
      ownerId: userId,
      ownerName: userName,
      inviteCode,
      maxMembers: data.maxMembers || DEFAULT_MAX_MEMBERS,
      memberCount: 1,
      seasonId,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: DEFAULT_LEAGUE_SETTINGS,
    };
  },

  /**
   * Get league by ID
   */
  async getLeagueById(leagueId: string): Promise<League | null> {
    const docRef = doc(db, 'leagues', leagueId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return { id: docSnap.id, ...docSnap.data() } as League;
  },

  /**
   * Get league by invite code
   */
  async getLeagueByCode(code: string): Promise<League | null> {
    const q = query(
      leaguesCollection,
      where('inviteCode', '==', code.toUpperCase()),
      limit(1)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() } as League;
  },

  /**
   * Get leagues for a user
   */
  async getUserLeagues(userId: string): Promise<League[]> {
    try {
      // Get all league IDs where user is a member using collection group
      const membershipQuery = query(
        collectionGroup(db, 'members'),
        where('userId', '==', userId)
      );
      const membershipSnapshot = await getDocs(membershipQuery);

      if (membershipSnapshot.empty) {
        return [];
      }

      const leagueIds = membershipSnapshot.docs
        .map((doc) => doc.ref.parent.parent?.id)
        .filter(Boolean) as string[];

      // Fetch league details
      const leagues: League[] = [];
      for (const leagueId of leagueIds) {
        const league = await this.getLeagueById(leagueId);
        if (league) {
          leagues.push(league);
        }
      }

      return leagues;
    } catch (error) {
      // If collection group query fails (permissions/index), try alternate approach
      // Query leagues where user is owner as fallback
      console.log('Collection group query failed, trying fallback:', error);
      try {
        const ownerQuery = query(leaguesCollection, where('ownerId', '==', userId));
        const ownerSnapshot = await getDocs(ownerQuery);
        return ownerSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        })) as League[];
      } catch (fallbackError) {
        console.log('Fallback query also failed:', fallbackError);
        return [];
      }
    }
  },

  /**
   * Get public leagues
   */
  async getPublicLeagues(limitCount: number = 20): Promise<League[]> {
    const q = query(
      leaguesCollection,
      where('isPublic', '==', true),
      orderBy('memberCount', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as League[];
  },

  /**
   * Join a league
   */
  async joinLeague(
    leagueId: string,
    userId: string,
    userName: string
  ): Promise<LeagueMember> {
    const league = await this.getLeagueById(leagueId);

    if (!league) {
      throw new Error('League not found');
    }

    if (league.memberCount >= league.maxMembers) {
      throw new Error('League is full');
    }

    // Check if already a member
    const memberRef = doc(db, 'leagues', leagueId, 'members', userId);
    const existingMember = await getDoc(memberRef);
    if (existingMember.exists()) {
      throw new Error('Already a member of this league');
    }

    // Add member
    const memberData: Omit<LeagueMember, 'id'> = {
      leagueId,
      userId,
      displayName: userName,
      role: 'member',
      totalPoints: 0,
      rank: league.memberCount + 1,
      joinedAt: new Date(),
    };

    await setDoc(memberRef, {
      ...memberData,
      joinedAt: serverTimestamp(),
    });

    // Update member count
    const leagueRef = doc(db, 'leagues', leagueId);
    await updateDoc(leagueRef, {
      memberCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    return { id: userId, ...memberData };
  },

  /**
   * Leave a league
   */
  async leaveLeague(leagueId: string, userId: string): Promise<void> {
    const league = await this.getLeagueById(leagueId);

    if (!league) {
      throw new Error('League not found');
    }

    if (league.ownerId === userId) {
      throw new Error('Owner cannot leave the league. Transfer ownership first.');
    }

    // Remove member
    const memberRef = doc(db, 'leagues', leagueId, 'members', userId);
    await deleteDoc(memberRef);

    // Update member count
    const leagueRef = doc(db, 'leagues', leagueId);
    await updateDoc(leagueRef, {
      memberCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Get league members
   */
  async getLeagueMembers(leagueId: string): Promise<LeagueMember[]> {
    const membersCollection = collection(db, 'leagues', leagueId, 'members');
    const q = query(membersCollection, orderBy('totalPoints', 'desc'), limit(100));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc, index) => ({
      id: doc.id,
      ...doc.data(),
      rank: index + 1,
    })) as LeagueMember[];
  },

  /**
   * Update member points and recalculate rankings
   */
  async updateMemberPoints(
    leagueId: string,
    userId: string,
    pointsToAdd: number
  ): Promise<void> {
    const memberRef = doc(db, 'leagues', leagueId, 'members', userId);
    await updateDoc(memberRef, {
      totalPoints: increment(pointsToAdd),
    });

    // Recalculate rankings
    await this.recalculateRankings(leagueId);
  },

  /**
   * Recalculate rankings for all members
   */
  async recalculateRankings(leagueId: string): Promise<void> {
    const members = await this.getLeagueMembers(leagueId);
    const batch = writeBatch(db);

    members.forEach((member, index) => {
      const memberRef = doc(db, 'leagues', leagueId, 'members', member.userId);
      batch.update(memberRef, { rank: index + 1 });
    });

    await batch.commit();
  },

  /**
   * Delete league
   */
  async deleteLeague(leagueId: string, userId: string): Promise<void> {
    const league = await this.getLeagueById(leagueId);

    if (!league) {
      throw new Error('League not found');
    }

    if (league.ownerId !== userId) {
      throw new Error('Only the owner can delete the league');
    }

    // Delete all members
    const membersCollection = collection(db, 'leagues', leagueId, 'members');
    const membersSnapshot = await getDocs(membersCollection);
    const batch = writeBatch(db);

    membersSnapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    // Delete league
    batch.delete(doc(db, 'leagues', leagueId));

    await batch.commit();
  },

  /**
   * Get league members with cursor-based pagination
   */
  async getLeagueMembersPage(
    leagueId: string,
    pageSize: number = 25,
    startAfterDoc?: QueryDocumentSnapshot<DocumentData>
  ): Promise<{ members: LeagueMember[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const membersCollection = collection(db, 'leagues', leagueId, 'members');
    const q = startAfterDoc
      ? query(membersCollection, orderBy('totalPoints', 'desc'), startAfter(startAfterDoc), limit(pageSize))
      : query(membersCollection, orderBy('totalPoints', 'desc'), limit(pageSize));
    const snapshot = await getDocs(q);

    const members = snapshot.docs.map((doc, index) => ({
      id: doc.id,
      ...doc.data(),
      rank: startAfterDoc ? -1 : index + 1, // Rank only accurate on first page
    })) as LeagueMember[];

    const lastDoc = snapshot.docs.length > 0
      ? snapshot.docs[snapshot.docs.length - 1]
      : null;

    return { members, lastDoc };
  },

  /**
   * Remove a member from the league (admin only)
   */
  async removeMember(leagueId: string, memberId: string): Promise<void> {
    const memberRef = doc(db, 'leagues', leagueId, 'members', memberId);
    const leagueRef = doc(db, 'leagues', leagueId);

    await deleteDoc(memberRef);

    // Decrement member count
    await updateDoc(leagueRef, {
      memberCount: increment(-1),
    });

    // Recalculate rankings
    await this.recalculateRankings(leagueId);
  },

  /**
   * Invite a member by email (sends an invitation)
   */
  async inviteMemberByEmail(leagueId: string, email: string): Promise<void> {
    // Check invite limit: max 3x maxMembers
    const league = await this.getLeagueById(leagueId);
    if (!league) {
      throw new Error('League not found');
    }
    const invitesCollection = collection(db, 'leagues', leagueId, 'invites');
    const inviteSnap = await getDocs(invitesCollection);
    const maxInvites = 3 * league.maxMembers;
    if (inviteSnap.size >= maxInvites) {
      throw new Error(`Invite limit reached (${maxInvites}). You cannot send more than 3x your league's max members in invitations.`);
    }

    await addDoc(invitesCollection, {
      email: email.toLowerCase(),
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
  },

  /**
   * Promote a member to co-admin
   */
  async promoteToCoAdmin(leagueId: string, userId: string): Promise<void> {
    const league = await this.getLeagueById(leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    // Update league's coAdminIds array
    const leagueRef = doc(db, 'leagues', leagueId);
    const currentCoAdmins = league.coAdminIds || [];

    if (currentCoAdmins.includes(userId)) {
      throw new Error('User is already a co-admin');
    }

    await updateDoc(leagueRef, {
      coAdminIds: [...currentCoAdmins, userId],
      updatedAt: serverTimestamp(),
    });

    // Update member's role in the members subcollection
    const memberRef = doc(db, 'leagues', leagueId, 'members', userId);
    await updateDoc(memberRef, {
      role: 'admin',
    });
  },

  /**
   * Demote a co-admin back to member
   */
  async demoteFromCoAdmin(leagueId: string, userId: string): Promise<void> {
    const league = await this.getLeagueById(leagueId);
    if (!league) {
      throw new Error('League not found');
    }

    // Update league's coAdminIds array
    const leagueRef = doc(db, 'leagues', leagueId);
    const currentCoAdmins = league.coAdminIds || [];

    if (!currentCoAdmins.includes(userId)) {
      throw new Error('User is not a co-admin');
    }

    await updateDoc(leagueRef, {
      coAdminIds: currentCoAdmins.filter(id => id !== userId),
      updatedAt: serverTimestamp(),
    });

    // Update member's role in the members subcollection
    const memberRef = doc(db, 'leagues', leagueId, 'members', userId);
    await updateDoc(memberRef, {
      role: 'member',
    });
  },

  /**
   * Check if a user is an admin (owner or co-admin) of a league
   */
  isUserAdmin(league: League, userId: string): boolean {
    if (league.ownerId === userId) return true;
    return league.coAdminIds?.includes(userId) || false;
  },
};
