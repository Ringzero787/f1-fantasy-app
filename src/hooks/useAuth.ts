import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth.store';
import { authService } from '../services/auth.service';

// Tracks whether Firebase onAuthStateChanged has fired at least once.
// Shared across all useAuth() consumers so the root index can gate on it.
let _authReady = false;
const _listeners = new Set<(v: boolean) => void>();
function setAuthReady() {
  if (_authReady) return;
  _authReady = true;
  _listeners.forEach(fn => fn(true));
}

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

  const [authReady, setReady] = useState(_authReady);

  useEffect(() => {
    // Demo mode is always "ready"
    if (isDemoMode) {
      setAuthReady();
      return;
    }

    // Subscribe to auth state changes
    const unsubscribe = authService.onAuthStateChanged((user) => {
      setUser(user);
      setAuthReady();
    });

    return () => unsubscribe();
  }, [setUser, isDemoMode]);

  // Listen for the global authReady flag
  useEffect(() => {
    if (_authReady) { setReady(true); return; }
    const handler = (v: boolean) => setReady(v);
    _listeners.add(handler);
    return () => { _listeners.delete(handler); };
  }, []);

  return {
    user,
    isAuthenticated,
    isLoading,
    isDemoMode,
    isAdmin,
    error,
    authReady,
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
