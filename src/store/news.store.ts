import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Article } from '../types';
import { articleService } from '../services/article.service';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface NewsState {
  articles: Article[];
  lastFetchTime: number | null;
  isLoading: boolean;
  error: string | null;
  readArticleIds: string[];

  loadArticles: (force?: boolean) => Promise<void>;
  toggleArticleRead: (id: string) => void;
  isArticleRead: (id: string) => boolean;
  clearCache: () => void;
}

export const useNewsStore = create<NewsState>()(
  persist(
    (set, get) => ({
      articles: [],
      lastFetchTime: null,
      isLoading: false,
      error: null,
      readArticleIds: [],

      loadArticles: async (force = false) => {
        const { lastFetchTime, isLoading } = get();
        if (isLoading) return;

        // Skip if cache is fresh (unless forced)
        if (!force && lastFetchTime && Date.now() - lastFetchTime < CACHE_TTL_MS) {
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const articles = await articleService.fetchApprovedArticles(20);
          set({
            articles,
            lastFetchTime: Date.now(),
            isLoading: false,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to load news';
          set({ error: message, isLoading: false });
        }
      },

      toggleArticleRead: (id: string) => {
        const { readArticleIds } = get();
        if (readArticleIds.includes(id)) {
          set({ readArticleIds: readArticleIds.filter(rid => rid !== id) });
        } else {
          set({ readArticleIds: [...readArticleIds, id] });
        }
      },

      isArticleRead: (id: string) => {
        return get().readArticleIds.includes(id);
      },

      clearCache: () => {
        set({ articles: [], lastFetchTime: null });
      },
    }),
    {
      name: 'news-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        articles: state.articles,
        lastFetchTime: state.lastFetchTime,
        readArticleIds: state.readArticleIds,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.articles) {
          state.articles = state.articles.map(article => ({
            ...article,
            publishedAt: new Date(article.publishedAt),
            createdAt: new Date(article.createdAt),
            reviewedAt: article.reviewedAt ? new Date(article.reviewedAt) : undefined,
          }));
        }
      },
    }
  )
);
