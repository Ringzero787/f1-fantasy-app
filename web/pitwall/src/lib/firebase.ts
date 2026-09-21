import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { firebaseConfig, hasFirebaseConfig } from './env';

let app: FirebaseApp | null = null;
export function firebaseApp(): FirebaseApp {
  if (!hasFirebaseConfig) throw new Error('Pit Wall is not configured: the VITE_FIREBASE_* values are missing from this build.');
  app ??= initializeApp(firebaseConfig);
  return app;
}
export const auth = (): Auth => getAuth(firebaseApp());

// Firestore and Functions are loaded on demand so they stay out of the first-load bundle (F-075 budget: 250 KB gzip).
export const firestore = async () => { const m = await import('firebase/firestore'); return { m, db: m.getFirestore(firebaseApp()) }; };
export const callable = async <Req, Res>(name: string) => { const m = await import('firebase/functions'); return m.httpsCallable<Req, Res>(m.getFunctions(firebaseApp(), 'us-central1'), name); };
