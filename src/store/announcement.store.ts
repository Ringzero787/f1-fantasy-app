import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LeagueAnnouncement, AnnouncementReply } from '../types';
import { announcementService } from '../services/announcement.service';
import { useAuthStore } from './auth.store';

interface AnnouncementState {
  activeAnnouncements: LeagueAnnouncement[];
  dismissedIds: string[];
  replies: AnnouncementReply[];
  announcementHistory: LeagueAnnouncement[];
  isLoading: boolean;
  isPosting: boolean;
  isLoadingReplies: boolean;
  isSubmittingReply: boolean;
  error: string | null;

  loadActiveAnnouncements: (leagueIds: string[]) => Promise<void>;
  dismissAnnouncement: (id: string) => void;
  getFirstUndismissed: () => LeagueAnnouncement | null;
  postAnnouncement: (
    leagueId: string,
    leagueName: string,
    authorId: string,
    authorName: string,
    message: string
  ) => Promise<void>;
  deactivateAnnouncement: (leagueId: string, announcementId: string) => Promise<void>;
  submitReply: (
    leagueId: string,
    announcementId: string,
    userId: string,
    displayName: string,
    message: string
  ) => Promise<void>;
  loadReplies: (leagueId: string, announcementId: string) => Promise<void>;
  loadAnnouncementHistory: (leagueId: string) => Promise<void>;
}

export const useAnnouncementStore = create<AnnouncementState>()(
  persist(
    (set, get) => ({
      activeAnnouncements: [],
      dismissedIds: [],
      replies: [],
      announcementHistory: [],
      isLoading: false,
      isPosting: false,
      isLoadingReplies: false,
      isSubmittingReply: false,
      error: null,

      loadActiveAnnouncements: async (leagueIds) => {
        const { isLoading } = get();
        if (isLoading) return;

        const isDemoMode = useAuthStore.getState().isDemoMode;
        set({ isLoading: true, error: null });
        try {
          if (isDemoMode) {
            // In demo mode, just keep whatever is already in local state
            set({ isLoading: false });
            return;
          }
          const announcements = await announcementService.getActiveAnnouncementsForLeagues(leagueIds);
          set({ activeAnnouncements: announcements, isLoading: false });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to load announcements';
          set({ error: message, isLoading: false });
        }
      },

      dismissAnnouncement: (id) => {
        const { dismissedIds } = get();
        if (!dismissedIds.includes(id)) {
          set({ dismissedIds: [...dismissedIds, id] });
        }
      },

      getFirstUndismissed: () => {
        const { activeAnnouncements, dismissedIds } = get();
        return activeAnnouncements.find(a => !dismissedIds.includes(a.id)) || null;
      },

      postAnnouncement: async (leagueId, leagueName, authorId, authorName, message) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        set({ isPosting: true, error: null });
        try {
          if (isDemoMode) {
            const newAnn: LeagueAnnouncement = {
              id: `demo-ann-${Date.now()}`,
              leagueId,
              leagueName,
              authorId,
              authorName,
              message,
              isActive: true,
              replyCount: 0,
              createdAt: new Date(),
            };
            const { activeAnnouncements, announcementHistory } = get();
            // Deactivate previous active for this league in both lists
            const updatedActive = activeAnnouncements.map(a =>
              a.leagueId === leagueId ? { ...a, isActive: false } : a
            ).filter(a => a.isActive);
            const updatedHistory = announcementHistory.map(a =>
              a.leagueId === leagueId && a.isActive ? { ...a, isActive: false } : a
            );
            set({
              activeAnnouncements: [...updatedActive, newAnn],
              announcementHistory: [newAnn, ...updatedHistory],
              isPosting: false,
            });
            return;
          }

          const newAnn = await announcementService.postAnnouncement(
            leagueId, leagueName, authorId, authorName, message
          );
          // Refresh active list: replace any old active for this league
          const { activeAnnouncements } = get();
          const filtered = activeAnnouncements.filter(a => a.leagueId !== leagueId);
          set({
            activeAnnouncements: [...filtered, newAnn],
            isPosting: false,
          });
        } catch (e) {
          const message2 = e instanceof Error ? e.message : 'Failed to post announcement';
          set({ error: message2, isPosting: false });
          throw e;
        }
      },

      deactivateAnnouncement: async (leagueId, announcementId) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        try {
          if (isDemoMode) {
            const { activeAnnouncements, announcementHistory } = get();
            set({
              activeAnnouncements: activeAnnouncements.filter(a => a.id !== announcementId),
              announcementHistory: announcementHistory.map(a =>
                a.id === announcementId ? { ...a, isActive: false } : a
              ),
            });
            return;
          }
          await announcementService.deactivateAnnouncement(leagueId, announcementId);
          const { activeAnnouncements } = get();
          set({ activeAnnouncements: activeAnnouncements.filter(a => a.id !== announcementId) });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to deactivate';
          set({ error: message });
        }
      },

      submitReply: async (leagueId, announcementId, userId, displayName, message) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        set({ isSubmittingReply: true, error: null });
        try {
          if (isDemoMode) {
            const reply: AnnouncementReply = {
              id: userId,
              announcementId,
              userId,
              displayName,
              message,
              createdAt: new Date(),
            };
            const { replies, activeAnnouncements } = get();
            // Replace existing reply from same user or add new
            const filtered = replies.filter(r => !(r.announcementId === announcementId && r.userId === userId));
            const existedBefore = replies.some(r => r.announcementId === announcementId && r.userId === userId);
            set({
              replies: [...filtered, reply],
              activeAnnouncements: existedBefore ? activeAnnouncements : activeAnnouncements.map(a =>
                a.id === announcementId ? { ...a, replyCount: a.replyCount + 1 } : a
              ),
              isSubmittingReply: false,
            });
            return;
          }
          await announcementService.submitReply(leagueId, announcementId, userId, displayName, message);
          set({ isSubmittingReply: false });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to submit reply';
          set({ error: msg, isSubmittingReply: false });
        }
      },

      loadReplies: async (leagueId, announcementId) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        set({ isLoadingReplies: true, error: null });
        try {
          if (isDemoMode) {
            // In demo mode, replies are already in local state
            set({ isLoadingReplies: false });
            return;
          }
          const replies = await announcementService.getReplies(leagueId, announcementId);
          set({ replies, isLoadingReplies: false });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to load replies';
          set({ error: msg, isLoadingReplies: false });
        }
      },

      loadAnnouncementHistory: async (leagueId) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        try {
          if (isDemoMode) {
            // History is already local in demo mode
            return;
          }
          const history = await announcementService.getAnnouncementHistory(leagueId);
          set({ announcementHistory: history });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to load history';
          set({ error: msg });
        }
      },
    }),
    {
      name: 'announcement-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeAnnouncements: state.activeAnnouncements,
        dismissedIds: state.dismissedIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.activeAnnouncements) {
          state.activeAnnouncements = state.activeAnnouncements.map(a => ({
            ...a,
            createdAt: new Date(a.createdAt),
          }));
        }
      },
    }
  )
);
