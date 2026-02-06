import { useEffect } from 'react';
import { useAuthStore } from '../store/auth.store';
import { authService } from '../services/auth.service';

export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    isDemoMode,
    isAdmin,
    error,
    setUser,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signUp,
    signOut,
    resetPassword,
    enterDemoMode,
    clearError,
  } = useAuthStore();

  useEffect(() => {
    // Don't subscribe to auth changes in demo mode
    if (isDemoMode) {
      return;
    }

    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, [setUser, isDemoMode]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isDemoMode,
    isAdmin,
    error,
    signIn,
    signInWithGoogle,
    signInWithApple,
    signUp,
    signOut,
    resetPassword,
    enterDemoMode,
    clearError,
  };
}
