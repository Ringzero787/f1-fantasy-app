import { Platform } from 'react-native';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// @ts-ignore — getReactNativePersistence is in the RN bundle but missing from TS types
import { initializeAuth, getAuth, getReactNativePersistence, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';
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
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

let app: FirebaseApp;
let firebaseAuth: Auth;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  if (Platform.OS === 'web') {
    // Browser uses Firebase Auth's default persistence (IndexedDB / localStorage).
    firebaseAuth = getAuth(app);
  } else {
    firebaseAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  }
} else {
  app = getApp();
  firebaseAuth = getAuth(app);
}

export { firebaseAuth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

// Track Limits writes to tl_*-prefixed collections so it can coexist with
// Undercut data under the same Firebase project.
export const collections = {
  // TL-owned (writable from TL app)
  users: collection(db, 'tl_users'),
  garages: collection(db, 'tl_garages'),
  lineups: collection(db, 'tl_lineups'),
  leagues: collection(db, 'tl_leagues'),
  ledger: collection(db, 'tl_ledger'),
  transactions: collection(db, 'tl_transactions'),

  // Shared / read-only — populated by Undercut's ingestion pipeline
  drivers: collection(db, 'drivers'),
  constructors: collection(db, 'constructors'),
  races: collection(db, 'races'),
  seasons: collection(db, 'seasons'),
} as const;

export const getLeagueMembers = (leagueId: string) =>
  collection(db, 'tl_leagues', leagueId, 'members');

export const getLeagueLedger = (leagueId: string) =>
  collection(db, 'tl_leagues', leagueId, 'ledger');

export const getRaceResults = (raceId: string) =>
  collection(db, 'races', raceId, 'results');

export const serverTimestamp = firestoreServerTimestamp;
export const arrayUnion = firestoreArrayUnion;
export const arrayRemove = firestoreArrayRemove;
export const increment = firestoreIncrement;

export type {
  Auth,
  Firestore,
  FirebaseStorage,
  Functions,
  CollectionReference,
  DocumentReference,
  Query,
  DocumentSnapshot,
  QuerySnapshot,
};

export { app, doc, collection, httpsCallable };
