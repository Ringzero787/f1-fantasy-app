import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Constructor } from '../types';

const constructorsCollection = collection(db, 'constructors');

export const constructorService = {
  /**
   * Get all active constructors
   */
  async getAllConstructors(): Promise<Constructor[]> {
    const q = query(
      constructorsCollection,
      where('isActive', '==', true),
      orderBy('price', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Constructor[];
  },

  /**
   * Get constructor by ID
   */
  async getConstructorById(constructorId: string): Promise<Constructor | null> {
    const docRef = doc(db, 'constructors', constructorId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return { id: docSnap.id, ...docSnap.data() } as Constructor;
  },

  /**
   * Get affordable constructors
   */
  async getAffordableConstructors(maxPrice: number): Promise<Constructor[]> {
    const q = query(
      constructorsCollection,
      where('isActive', '==', true),
      where('price', '<=', maxPrice),
      orderBy('price', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Constructor[];
  },

  /**
   * Get top constructors by points
   */
  async getTopConstructors(limitCount: number = 5): Promise<Constructor[]> {
    const q = query(
      constructorsCollection,
      where('isActive', '==', true),
      orderBy('fantasyPoints', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Constructor[];
  },

};
