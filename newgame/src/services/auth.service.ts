import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseAuth, db } from '../config/firebase';
import { DEFAULT_HELMET_URL } from '../data/cosmeticsCatalog';
import type { TLUser, TLUserSettings, LoginForm, RegisterForm } from '../types';

const USERS_COLLECTION = 'tl_users';

const DEFAULT_SETTINGS: TLUserSettings = {
  notifications: true,
  theme: 'auto',
};

export const authService = {
  async signIn({ email, password }: LoginForm): Promise<TLUser> {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
    if (!credential.user) throw new Error('Authentication failed');

    const userDoc = await getDoc(doc(db, USERS_COLLECTION, credential.user.uid));
    if (!userDoc.exists()) {
      return this.createUserProfile(credential.user.uid, {
        email: credential.user.email || email,
        displayName: credential.user.displayName || email.split('@')[0],
      });
    }
    return { id: userDoc.id, ...userDoc.data() } as TLUser;
  },

  async signInWithGoogle(idToken: string): Promise<TLUser> {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(firebaseAuth, credential);
    if (!result.user) throw new Error('Google authentication failed');

    const userDoc = await getDoc(doc(db, USERS_COLLECTION, result.user.uid));
    if (!userDoc.exists()) {
      return this.createUserProfile(result.user.uid, {
        email: result.user.email || '',
        displayName: result.user.displayName || 'Track Limits Player',
        photoURL: result.user.photoURL || undefined,
      });
    }
    return { id: userDoc.id, ...userDoc.data() } as TLUser;
  },

  async register({ email, password, displayName }: RegisterForm): Promise<TLUser> {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
    if (!credential.user) throw new Error('Registration failed');

    await updateProfile(credential.user, { displayName });
    return this.createUserProfile(credential.user.uid, { email, displayName });
  },

  async createUserProfile(
    userId: string,
    data: { email: string; displayName: string; photoURL?: string }
  ): Promise<TLUser> {
    const now = new Date();
    const user: Omit<TLUser, 'id'> = {
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL,
      activeHelmetUrl: DEFAULT_HELMET_URL,
      hasOnboarded: false,
      createdAt: now,
      updatedAt: now,
      settings: DEFAULT_SETTINGS,
    };

    const firestoreData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(user)) {
      if (value !== undefined) firestoreData[key] = value;
    }

    await setDoc(doc(db, USERS_COLLECTION, userId), {
      ...firestoreData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { id: userId, ...user };
  },

  async signOut(): Promise<void> {
    await signOut(firebaseAuth);
  },

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(firebaseAuth, email);
  },

  // Anonymous demo sign-in. Returns a fully-functional TLUser scoped to a fresh
  // Firebase anonymous uid; all collections (garage, lineups, bets, insurance,
  // leagues) work normally. Anonymous Auth must be enabled in the Firebase
  // console — if not, this throws auth/operation-not-allowed.
  async signInAsGuest(): Promise<TLUser> {
    const result = await signInAnonymously(firebaseAuth);
    if (!result.user) throw new Error('Anonymous sign-in failed');
    const uid = result.user.uid;
    const existing = await this.getUserProfile(uid);
    if (existing) return existing;
    const suffix = uid.slice(-4).toUpperCase();
    return this.createUserProfile(uid, {
      email: `demo-${suffix}@tracklimits.local`,
      displayName: `Demo ${suffix}`,
    });
  },

  getCurrentUser() {
    return firebaseAuth.currentUser;
  },

  async getUserProfile(userId: string): Promise<TLUser | null> {
    const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
    if (!userDoc.exists()) return null;
    const data = userDoc.data();
    // Older accounts can lack displayName; every consumer assumes it exists
    // (profile initial, league member docs — writing undefined into Firestore
    // throws). Normalize once here so no screen has to.
    const displayName =
      data.displayName || (typeof data.email === 'string' && data.email.split('@')[0]) || 'Player';
    return { id: userDoc.id, ...data, displayName } as TLUser;
  },

  async updateUserProfile(
    userId: string,
    data: Partial<Pick<TLUser, 'displayName' | 'photoURL' | 'settings'>>
  ): Promise<void> {
    const cleanData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) cleanData[key] = value;
    }
    await updateDoc(doc(db, USERS_COLLECTION, userId), {
      ...cleanData,
      updatedAt: serverTimestamp(),
    });
  },

  async markOnboarded(userId: string): Promise<void> {
    await updateDoc(doc(db, USERS_COLLECTION, userId), {
      hasOnboarded: true,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteAccount(userId: string): Promise<void> {
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
    const currentUser = firebaseAuth.currentUser;
    if (currentUser && currentUser.uid === userId) {
      await currentUser.delete();
    }
  },

  onAuthStateChanged(callback: (user: TLUser | null) => void) {
    return onAuthStateChanged(firebaseAuth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const profile = await this.getUserProfile(firebaseUser.uid);
        callback(profile);
      } else {
        callback(null);
      }
    });
  },
};
