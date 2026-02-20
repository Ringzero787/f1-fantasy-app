import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '../types';
import { chatService } from '../services/chat.service';
import { useAuthStore } from './auth.store';

interface ChatState {
  messagesByLeague: Record<string, ChatMessage[]>;
  unreadCounts: Record<string, number>;
  totalUnread: number;
  activeLeagueId: string | null;
  replyingTo: ChatMessage | null;
  isLoadingMessages: boolean;
  isSending: boolean;
  isLoadingOlder: boolean;
  hasMoreOlderMessages: Record<string, boolean>;
  lastReadTimestamps: Record<string, number>; // persisted
  subscriptionErrors: Record<string, string>; // leagueId -> error message
  sendError: string | null;

  // Subscription management
  _unsubscribeFns: Record<string, () => void>;

  subscribe: (leagueId: string) => void;
  unsubscribe: (leagueId: string) => void;
  sendMessage: (
    leagueId: string,
    text: string,
    imageUrl?: string
  ) => Promise<void>;
  loadOlder: (leagueId: string) => Promise<void>;
  toggleReaction: (
    leagueId: string,
    messageId: string,
    emoji: string
  ) => Promise<void>;
  deleteMessage: (leagueId: string, messageId: string) => Promise<void>;
  setReplyingTo: (message: ChatMessage | null) => void;
  markAsRead: (leagueId: string) => void;
  loadUnreadCounts: (leagueIds: string[]) => Promise<void>;
  clearChatState: () => void;
}

const DEMO_MESSAGES: ChatMessage[] = [
  {
    id: 'demo-msg-1',
    senderId: 'demo-user-2',
    senderName: 'Alex Racing',
    text: 'Who do you think will win the next race?',
    reactions: { '🔥': ['demo-user-3'] },
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: 'demo-msg-2',
    senderId: 'demo-user-3',
    senderName: 'Speed King',
    text: 'I think Norris has been in great form lately! His price is insane though 😅',
    reactions: { '👍': ['demo-user-2'] },
    createdAt: new Date(Date.now() - 1800000),
  },
  {
    id: 'demo-msg-3',
    senderId: 'demo-user-2',
    senderName: 'Alex Racing',
    text: 'Yeah $510 is steep. I went with Piastri instead - better value at $380',
    replyTo: {
      messageId: 'demo-msg-2',
      senderName: 'Speed King',
      text: 'I think Norris has been in great form lately! His price is insane though 😅',
    },
    reactions: {},
    createdAt: new Date(Date.now() - 900000),
  },
];

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messagesByLeague: {},
      unreadCounts: {},
      totalUnread: 0,
      activeLeagueId: null,
      replyingTo: null,
      isLoadingMessages: false,
      isSending: false,
      isLoadingOlder: false,
      hasMoreOlderMessages: {},
      lastReadTimestamps: {},
      subscriptionErrors: {},
      sendError: null,
      _unsubscribeFns: {},

      subscribe: (leagueId: string) => {
        const { _unsubscribeFns } = get();
        // Already subscribed
        if (_unsubscribeFns[leagueId]) return;

        const isDemoMode = useAuthStore.getState().isDemoMode;
        // Clear any previous error for this league
        const prevErrors = { ...get().subscriptionErrors };
        delete prevErrors[leagueId];
        set({ activeLeagueId: leagueId, isLoadingMessages: true, subscriptionErrors: prevErrors, sendError: null });

        if (isDemoMode) {
          set({
            messagesByLeague: {
              ...get().messagesByLeague,
              [leagueId]: DEMO_MESSAGES,
            },
            hasMoreOlderMessages: {
              ...get().hasMoreOlderMessages,
              [leagueId]: false,
            },
            isLoadingMessages: false,
          });
          return;
        }

        const unsubscribe = chatService.subscribeToMessages(
          leagueId,
          50,
          (messages) => {
            const { lastReadTimestamps } = get();
            const lastRead = lastReadTimestamps[leagueId] || 0;
            const unreadCount = messages.filter(
              (m) =>
                m.senderId !== useAuthStore.getState().user?.id &&
                m.createdAt.getTime() > lastRead
            ).length;

            const newUnreadCounts = {
              ...get().unreadCounts,
              [leagueId]: unreadCount,
            };
            const newTotalUnread = Object.values(newUnreadCounts).reduce(
              (sum, c) => sum + c,
              0
            );

            set({
              messagesByLeague: {
                ...get().messagesByLeague,
                [leagueId]: messages,
              },
              unreadCounts: newUnreadCounts,
              totalUnread: newTotalUnread,
              hasMoreOlderMessages: {
                ...get().hasMoreOlderMessages,
                [leagueId]: messages.length >= 50,
              },
              isLoadingMessages: false,
            });
          },
          (error) => {
            // Permission denied or league doesn't exist in Firestore
            console.warn('Chat subscribe failed for league', leagueId, error.message);
            const errorMsg = error.message?.includes('permission')
              ? 'Chat unavailable — league not synced to server yet'
              : 'Could not connect to chat';
            set({
              messagesByLeague: {
                ...get().messagesByLeague,
                [leagueId]: [],
              },
              hasMoreOlderMessages: {
                ...get().hasMoreOlderMessages,
                [leagueId]: false,
              },
              subscriptionErrors: {
                ...get().subscriptionErrors,
                [leagueId]: errorMsg,
              },
              isLoadingMessages: false,
            });
          }
        );

        set({
          _unsubscribeFns: { ...get()._unsubscribeFns, [leagueId]: unsubscribe },
        });
      },

      unsubscribe: (leagueId: string) => {
        const { _unsubscribeFns } = get();
        const unsub = _unsubscribeFns[leagueId];
        if (unsub) {
          unsub();
          const newFns = { ...get()._unsubscribeFns };
          delete newFns[leagueId];
          set({ _unsubscribeFns: newFns });
        }
        if (get().activeLeagueId === leagueId) {
          set({ activeLeagueId: null, replyingTo: null });
        }
      },

      sendMessage: async (leagueId, text, imageUrl) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        const user = useAuthStore.getState().user;
        if (!user) return;

        set({ isSending: true, sendError: null });
        try {
          const { replyingTo, subscriptionErrors } = get();

          // If subscription failed, can't send messages
          if (subscriptionErrors[leagueId]) {
            set({ isSending: false, sendError: 'Cannot send — chat is not connected' });
            return;
          }

          if (isDemoMode) {
            const newMsg: ChatMessage = {
              id: `demo-msg-${Date.now()}`,
              senderId: user.id,
              senderName: user.displayName,
              text,
              imageUrl,
              replyTo: replyingTo
                ? {
                    messageId: replyingTo.id,
                    senderName: replyingTo.senderName,
                    text: replyingTo.text.substring(0, 100),
                  }
                : undefined,
              reactions: {},
              createdAt: new Date(),
            };
            const messages = get().messagesByLeague[leagueId] || [];
            set({
              messagesByLeague: {
                ...get().messagesByLeague,
                [leagueId]: [newMsg, ...messages],
              },
              replyingTo: null,
              isSending: false,
            });
            return;
          }

          await chatService.sendMessage(leagueId, {
            senderId: user.id,
            senderName: user.displayName,
            senderAvatarUrl: user.photoURL,
            text,
            imageUrl,
            replyTo: replyingTo
              ? {
                  messageId: replyingTo.id,
                  senderName: replyingTo.senderName,
                  text: replyingTo.text.substring(0, 100),
                }
              : undefined,
          });
          set({ replyingTo: null, isSending: false });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to send message';
          console.error('Failed to send message:', e);
          set({ isSending: false, sendError: msg });
        }
      },

      loadOlder: async (leagueId) => {
        const { isLoadingOlder, hasMoreOlderMessages, messagesByLeague } = get();
        if (isLoadingOlder || !hasMoreOlderMessages[leagueId]) return;

        const isDemoMode = useAuthStore.getState().isDemoMode;
        if (isDemoMode) return;

        const messages = messagesByLeague[leagueId] || [];
        if (messages.length === 0) return;

        const oldestMessage = messages[messages.length - 1];
        set({ isLoadingOlder: true });

        try {
          const olderMessages = await chatService.loadOlderMessages(
            leagueId,
            oldestMessage.createdAt,
            30
          );

          set({
            messagesByLeague: {
              ...get().messagesByLeague,
              [leagueId]: [...messages, ...olderMessages],
            },
            hasMoreOlderMessages: {
              ...get().hasMoreOlderMessages,
              [leagueId]: olderMessages.length >= 30,
            },
            isLoadingOlder: false,
          });
        } catch (e) {
          console.error('Failed to load older messages:', e);
          set({ isLoadingOlder: false });
        }
      },

      toggleReaction: async (leagueId, messageId, emoji) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        const user = useAuthStore.getState().user;
        if (!user) return;

        if (isDemoMode) {
          const messages = get().messagesByLeague[leagueId] || [];
          const updated = messages.map((m) => {
            if (m.id !== messageId) return m;
            const reactions = { ...m.reactions };
            const users = reactions[emoji] || [];
            if (users.includes(user.id)) {
              const filtered = users.filter((u) => u !== user.id);
              if (filtered.length === 0) {
                delete reactions[emoji];
              } else {
                reactions[emoji] = filtered;
              }
            } else {
              reactions[emoji] = [...users, user.id];
            }
            return { ...m, reactions };
          });
          set({
            messagesByLeague: {
              ...get().messagesByLeague,
              [leagueId]: updated,
            },
          });
          return;
        }

        try {
          await chatService.toggleReaction(leagueId, messageId, emoji, user.id);
        } catch (e) {
          console.error('Failed to toggle reaction:', e);
        }
      },

      deleteMessage: async (leagueId, messageId) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;

        if (isDemoMode) {
          const messages = get().messagesByLeague[leagueId] || [];
          const updated = messages.map((m) =>
            m.id === messageId ? { ...m, isDeleted: true, text: '' } : m
          );
          set({
            messagesByLeague: {
              ...get().messagesByLeague,
              [leagueId]: updated,
            },
          });
          return;
        }

        try {
          await chatService.deleteMessage(leagueId, messageId);
        } catch (e) {
          console.error('Failed to delete message:', e);
        }
      },

      setReplyingTo: (message) => {
        set({ replyingTo: message });
      },

      markAsRead: (leagueId) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        const userId = useAuthStore.getState().user?.id;

        const now = Date.now();
        const newLastRead = {
          ...get().lastReadTimestamps,
          [leagueId]: now,
        };
        const newUnreadCounts = {
          ...get().unreadCounts,
          [leagueId]: 0,
        };
        const newTotalUnread = Object.values(newUnreadCounts).reduce(
          (sum, c) => sum + c,
          0
        );

        set({
          lastReadTimestamps: newLastRead,
          unreadCounts: newUnreadCounts,
          totalUnread: newTotalUnread,
        });

        if (!isDemoMode && userId) {
          chatService.updateReadReceipt(leagueId, userId).catch(console.error);
        }
      },

      loadUnreadCounts: async (leagueIds) => {
        const isDemoMode = useAuthStore.getState().isDemoMode;
        const userId = useAuthStore.getState().user?.id;
        if (isDemoMode || !userId) return;

        const { lastReadTimestamps } = get();
        const newUnreadCounts: Record<string, number> = {};

        for (const leagueId of leagueIds) {
          try {
            const serverTimestamp = await chatService.getReadReceipt(
              leagueId,
              userId
            );
            if (serverTimestamp) {
              const ts = serverTimestamp.getTime();
              // Update local timestamp if server is newer
              if (!lastReadTimestamps[leagueId] || ts > lastReadTimestamps[leagueId]) {
                lastReadTimestamps[leagueId] = ts;
              }
            }

            const latestMsg = await chatService.getLatestMessage(leagueId);
            if (latestMsg && latestMsg.senderId !== userId) {
              const lastRead = lastReadTimestamps[leagueId] || 0;
              if (latestMsg.createdAt.getTime() > lastRead) {
                newUnreadCounts[leagueId] = 1; // At least 1 unread
              } else {
                newUnreadCounts[leagueId] = 0;
              }
            } else {
              newUnreadCounts[leagueId] = 0;
            }
          } catch {
            newUnreadCounts[leagueId] = 0;
          }
        }

        const merged = { ...get().unreadCounts, ...newUnreadCounts };
        const total = Object.values(merged).reduce((sum, c) => sum + c, 0);

        set({
          lastReadTimestamps: { ...lastReadTimestamps },
          unreadCounts: merged,
          totalUnread: total,
        });
      },

      clearChatState: () => {
        // Unsubscribe from all active listeners
        const { _unsubscribeFns } = get();
        Object.values(_unsubscribeFns).forEach((unsub) => unsub());

        set({
          messagesByLeague: {},
          unreadCounts: {},
          totalUnread: 0,
          activeLeagueId: null,
          replyingTo: null,
          isLoadingMessages: false,
          isSending: false,
          isLoadingOlder: false,
          hasMoreOlderMessages: {},
          lastReadTimestamps: {},
          subscriptionErrors: {},
          sendError: null,
          _unsubscribeFns: {},
        });
      },
    }),
    {
      name: 'chat-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastReadTimestamps: state.lastReadTimestamps,
      }),
    }
  )
);
