import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { LeagueAnnouncement, AnnouncementReply } from '../types';

export const announcementService = {
  /**
   * Post a new announcement. Deactivates any current active announcement first.
   */
  async postAnnouncement(
    leagueId: string,
    leagueName: string,
    authorId: string,
    authorName: string,
    message: string
  ): Promise<LeagueAnnouncement> {
    // Deactivate current active announcement
    const active = await this.getActiveAnnouncement(leagueId);
    if (active) {
      await this.deactivateAnnouncement(leagueId, active.id);
    }

    const announcementsRef = collection(db, 'leagues', leagueId, 'announcements');
    const docRef = await addDoc(announcementsRef, {
      leagueId,
      leagueName,
      authorId,
      authorName,
      message,
      isActive: true,
      replyCount: 0,
      createdAt: serverTimestamp(),
    });

    return {
      id: docRef.id,
      leagueId,
      leagueName,
      authorId,
      authorName,
      message,
      isActive: true,
      replyCount: 0,
      createdAt: new Date(),
    };
  },

  /**
   * Get the active announcement for a league (max 1).
   */
  async getActiveAnnouncement(leagueId: string): Promise<LeagueAnnouncement | null> {
    const q = query(
      collection(db, 'leagues', leagueId, 'announcements'),
      where('isActive', '==', true),
      firestoreLimit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as LeagueAnnouncement;
  },

  /**
   * Get active announcements for multiple leagues.
   */
  async getActiveAnnouncementsForLeagues(leagueIds: string[]): Promise<LeagueAnnouncement[]> {
    const results: LeagueAnnouncement[] = [];
    for (const leagueId of leagueIds) {
      const ann = await this.getActiveAnnouncement(leagueId);
      if (ann) results.push(ann);
    }
    return results;
  },

  /**
   * Deactivate an announcement.
   */
  async deactivateAnnouncement(leagueId: string, announcementId: string): Promise<void> {
    const docRef = doc(db, 'leagues', leagueId, 'announcements', announcementId);
    await updateDoc(docRef, { isActive: false });
  },

  /**
   * Submit a reply (upsert — one reply per user per announcement).
   */
  async submitReply(
    leagueId: string,
    announcementId: string,
    userId: string,
    displayName: string,
    message: string
  ): Promise<void> {
    const replyRef = doc(
      db, 'leagues', leagueId, 'announcements', announcementId, 'replies', userId
    );

    // Check if this is a new reply (for replyCount increment)
    const existing = await getDoc(replyRef);
    const isNew = !existing.exists();

    await setDoc(replyRef, {
      announcementId,
      userId,
      displayName,
      message,
      createdAt: serverTimestamp(),
    });

    if (isNew) {
      const annRef = doc(db, 'leagues', leagueId, 'announcements', announcementId);
      await updateDoc(annRef, { replyCount: increment(1) });
    }
  },

  /**
   * Get all replies for an announcement.
   */
  async getReplies(leagueId: string, announcementId: string): Promise<AnnouncementReply[]> {
    const q = query(
      collection(db, 'leagues', leagueId, 'announcements', announcementId, 'replies'),
      orderBy('createdAt', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        announcementId,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as AnnouncementReply;
    });
  },

  /**
   * Get announcement history for a league.
   */
  async getAnnouncementHistory(
    leagueId: string,
    limitCount: number = 10
  ): Promise<LeagueAnnouncement[]> {
    const q = query(
      collection(db, 'leagues', leagueId, 'announcements'),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as LeagueAnnouncement;
    });
  },
};
