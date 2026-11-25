/**
 * Writes `users/{uid}.lastOpenAt` when the app opens or comes back to the foreground (F-175).
 *
 * The Monday "Your rank up is back" email goes only to chartered members who have not opened the
 * app since the week began, so the server needs to know when someone last did. At most one write
 * an hour, and never in demo mode or signed out. A failed write is ignored: the worst case is one
 * reminder email a player did not need.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseAuth } from '../config/firebase';
import { useAuthStore } from '../store/auth.store';
import { shouldStampOpen } from '../utils/lastOpen';


export function useLastOpenAt(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isDemoMode) return;
    const stamp = () => {
      const uid = firebaseAuth.currentUser?.uid;
      const now = Date.now();
      if (!uid || !shouldStampOpen(last.current, now)) return;
      last.current = now;
      setDoc(doc(db, 'users', uid), { lastOpenAt: serverTimestamp() }, { merge: true }).catch(() => {
        last.current = null;
      });
    };
    stamp();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') stamp(); });
    return () => sub.remove();
  }, [isAuthenticated, isDemoMode]);
}
