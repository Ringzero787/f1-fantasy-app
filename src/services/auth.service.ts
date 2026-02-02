import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
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
import type { User, UserSettings, LoginForm, RegisterForm } from '../types';

const DEFAULT_SETTINGS: UserSettings = {
  notifications: true,
  darkMode: false,
};

export const authService = {
  /**
   * Sign in with email and password
   */
  async signIn({ email, password }: LoginForm): Promise<User> {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);

    if (!credential.user) {
      throw new Error('Authentication failed');
    }

    const userDoc = await getDoc(doc(db, 'users', credential.user.uid));

    if (!userDoc.exists()) {
      // Create user profile if it doesn't exist
      return this.createUserProfile(credential.user.uid, {
        email: credential.user.email || email,
        displayName: credential.user.displayName || email.split('@')[0],
      });
    }

    return { id: userDoc.id, ...userDoc.data() } as User;
  },

  /**
   * Sign in with Google
   */
  async signInWithGoogle(idToken: string): Promise<User> {
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await signInWithCredential(firebaseAuth, credential);

    if (!result.user) {
      throw new Error('Google authentication failed');
    }

    const userDoc = await getDoc(doc(db, 'users', result.user.uid));

    if (!userDoc.exists()) {
      // Create user profile for new Google user
      return this.createUserProfile(result.user.uid, {
        email: result.user.email || '',
        displayName: result.user.displayName || 'Google User',
        photoURL: result.user.photoURL || undefined,
      });
    }

    return { id: userDoc.id, ...userDoc.data() } as User;
  },

  /**
   * Sign in with Apple
   */
  async signInWithApple(identityToken: string, nonce: string): Promise<User> {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: identityToken,
      rawNonce: nonce,
    });
    const result = await signInWithCredential(firebaseAuth, credential);

    if (!result.user) {
      throw new Error('Apple authentication failed');
    }

    const userDoc = await getDoc(doc(db, 'users', result.user.uid));

    if (!userDoc.exists()) {
      // Create user profile for new Apple user
      // Apple may or may not provide name/email based on user preferences
      return this.createUserProfile(result.user.uid, {
        email: result.user.email || '',
        displayName: result.user.displayName || 'Apple User',
      });
    }

    return { id: userDoc.id, ...userDoc.data() } as User;
  },

  /**
   * Register a new user
   */
  async register({ email, password, displayName }: RegisterForm): Promise<User> {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);

    if (!credential.user) {
      throw new Error('Registration failed');
    }

    // Update display name
    await updateProfile(credential.user, { displayName });

    // Create user profile in Firestore
    return this.createUserProfile(credential.user.uid, { email, displayName });
  },

  /**
   * Create user profile in Firestore
   */
  async createUserProfile(
    userId: string,
    data: { email: string; displayName: string; photoURL?: string }
  ): Promise<User> {
    const now = new Date();
    const user: Omit<User, 'id'> = {
      email: data.email,
      displayName: data.displayName,
      photoURL: data.photoURL,
      createdAt: now,
      updatedAt: now,
      settings: DEFAULT_SETTINGS,
    };

    await setDoc(doc(db, 'users', userId), {
      ...user,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { id: userId, ...user };
  },

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    await signOut(firebaseAuth);
  },

  /**
   * Send password reset email
   */
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(firebaseAuth, email);
  },

  /**
   * Get current user
   */
  getCurrentUser() {
    return firebaseAuth.currentUser;
  },

  /**
   * Get user profile from Firestore
   */
  async getUserProfile(userId: string): Promise<User | null> {
    const userDoc = await getDoc(doc(db, 'users', userId));

    if (!userDoc.exists()) {
      return null;
    }

    return { id: userDoc.id, ...userDoc.data() } as User;
  },

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    data: Partial<Pick<User, 'displayName' | 'photoURL' | 'settings'>>
  ): Promise<void> {
    await updateDoc(doc(db, 'users', userId), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Update user settings
   */
  async updateSettings(userId: string, settings: Partial<UserSettings>): Promise<void> {
    await updateDoc(doc(db, 'users', userId), {
      settings,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Delete user account
   */
  async deleteAccount(userId: string): Promise<void> {
    // Delete user profile from Firestore
    await deleteDoc(doc(db, 'users', userId));

    // Delete Firebase auth user
    const currentUser = firebaseAuth.currentUser;
    if (currentUser && currentUser.uid === userId) {
      await currentUser.delete();
    }
  },

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChanged(callback: (user: User | null) => void) {
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
