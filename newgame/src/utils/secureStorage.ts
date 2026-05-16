import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { StateStorage } from 'zustand/middleware';

// On native, use the OS keychain via expo-secure-store (~2KB limit per value).
// On web, fall back to localStorage — web has no equivalent secure store anyway.
const isWeb = Platform.OS === 'web';

const webStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return typeof window !== 'undefined' ? window.localStorage.getItem(name) : null;
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(name, value);
    } catch {
      // quota etc — fail silently, the store still works in-memory
    }
  },
  removeItem: async (name) => {
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

const nativeStorage: StateStorage = {
  getItem: async (name) => {
    try {
      return await SecureStore.getItemAsync(name);
    } catch (err) {
      console.warn(`[secureStorage] getItem("${name}") failed:`, err);
      return null;
    }
  },
  setItem: async (name, value) => {
    try {
      await SecureStore.setItemAsync(name, value);
    } catch (err) {
      console.warn(`[secureStorage] setItem("${name}") failed (${value.length} chars):`, err);
    }
  },
  removeItem: async (name) => {
    try {
      await SecureStore.deleteItemAsync(name);
    } catch (err) {
      console.warn(`[secureStorage] removeItem("${name}") failed:`, err);
    }
  },
};

export const secureStorage: StateStorage = isWeb ? webStorage : nativeStorage;
