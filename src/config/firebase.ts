import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import {
  getFirestore,
  collection,
  doc,
  Firestore,
  CollectionReference,
  DocumentReference,
  Query,
  DocumentSnapshot,
  QuerySnapshot,
  serverTimestamp as firestoreServerTimestamp,
  arrayUnion as firestoreArrayUnion,
  arrayRemove as firestoreArrayRemove,
  increment as firestoreIncrement,
  collectionGroup,
} from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

// Initialize Firebase
let app: FirebaseApp;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Export Firebase services
export const firebaseAuth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Collection references
export const collections = {
  users: collection(db, 'users'),
  leagues: collection(db, 'leagues'),
  drivers: collection(db, 'drivers'),
  constructors: collection(db, 'constructors'),
  fantasyTeams: collection(db, 'fantasyTeams'),
  races: collection(db, 'races'),
  transactions: collection(db, 'transactions'),
  seasons: collection(db, 'seasons'),
  notifications: collection(db, 'notifications'),
} as const;

// Helper to get subcollections
export const getLeagueMembers = (leagueId: string) =>
  collection(db, 'leagues', leagueId, 'members');

export const getLeagueInvites = (leagueId: string) =>
  collection(db, 'leagues', leagueId, 'invites');

export const getRaceResults = (raceId: string) =>
  collection(db, 'races', raceId, 'results');

export const getPriceHistory = (entityId: string) =>
  collection(db, 'priceHistory');

// Firestore helpers
export const serverTimestamp = firestoreServerTimestamp;
export const arrayUnion = firestoreArrayUnion;
export const arrayRemove = firestoreArrayRemove;
export const increment = firestoreIncrement;

// Helper to get collection group
export const getCollectionGroup = (collectionId: string) =>
  collectionGroup(db, collectionId);

// Type exports
export type { Auth, Firestore, FirebaseStorage, CollectionReference, DocumentReference, Query, DocumentSnapshot, QuerySnapshot };

export { app, doc, collection };
