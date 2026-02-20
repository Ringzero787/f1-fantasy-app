import * as SecureStore from 'expo-secure-store';
import { StateStorage } from 'zustand/middleware';

/**
 * Zustand StateStorage adapter backed by expo-secure-store.
 * Stores sensitive data (auth, purchases, push tokens) in the OS keychain
 * instead of plaintext AsyncStorage.
 *
 * Limits: SecureStore values are capped at ~2KB. If setItemAsync fails
 * (e.g. value too large), we log a warning but don't throw — the store
 * will still function in-memory and re-sync from server on next launch.
 */
export const secureStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (err) {
      console.warn(`[secureStorage] getItem("${name}") failed:`, err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (err) {
      console.warn(`[secureStorage] setItem("${name}") failed (value ${value.length} chars):`, err);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (err) {
      console.warn(`[secureStorage] removeItem("${name}") failed:`, err);
    }
  },
};
