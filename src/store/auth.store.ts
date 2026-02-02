import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';
import { authService } from '../services/auth.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (identityToken: string, nonce: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  enterDemoMode: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,  // Start as false - will show login if no persisted user
      isDemoMode: false,
      error: null,

      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
        }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error, isLoading: false }),

      signIn: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.signIn({ email, password });
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign in failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      signInWithGoogle: async (idToken) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.signInWithGoogle(idToken);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Google sign in failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      signInWithApple: async (identityToken, nonce) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.signInWithApple(identityToken, nonce);
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Apple sign in failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      signUp: async (email, password, displayName) => {
        set({ isLoading: true, error: null });
        try {
          const user = await authService.register({
            email,
            password,
            confirmPassword: password,
            displayName,
          });
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign up failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      signOut: async () => {
        const { isDemoMode } = get();
        set({ isLoading: true });
        try {
          if (!isDemoMode) {
            await authService.signOut();
          }
          set({ user: null, isAuthenticated: false, isDemoMode: false, isLoading: false });

          // Clear other stores on sign out
          import('./league.store').then(({ useLeagueStore }) => {
            useLeagueStore.getState().setLeagues([]);
            useLeagueStore.getState().setCurrentLeague(null);
          });
          import('./team.store').then(({ useTeamStore }) => {
            useTeamStore.getState().resetTeamState();
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Sign out failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      resetPassword: async (email) => {
        set({ isLoading: true, error: null });
        try {
          await authService.resetPassword(email);
          set({ isLoading: false });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Password reset failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      enterDemoMode: () => {
        const demoUser: User = {
          id: 'demo-user',
          email: 'demo@f1fantasy.app',
          displayName: 'Demo User',
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: {
            notifications: true,
            darkMode: false,
          },
        };
        set({
          user: demoUser,
          isAuthenticated: true,
          isDemoMode: true,
          isLoading: false,
        });

        // Clear other stores when entering demo mode for fresh start
        // Import dynamically to avoid circular dependencies
        import('./league.store').then(({ useLeagueStore }) => {
          useLeagueStore.getState().setLeagues([]);
          useLeagueStore.getState().setCurrentLeague(null);
        });
        import('./team.store').then(({ useTeamStore }) => {
          useTeamStore.getState().resetTeamState();
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isDemoMode: state.isDemoMode,
      }),
    }
  )
);
