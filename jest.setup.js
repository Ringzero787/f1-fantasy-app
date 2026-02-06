// Jest setup file
// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

// Mock Firebase
jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: () => ({
    initializeApp: jest.fn(),
  }),
}));

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  default: () => ({
    signInWithCredential: jest.fn(),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(),
  }),
}));

jest.mock('@react-native-firebase/firestore', () => ({
  __esModule: true,
  default: () => ({
    collection: jest.fn(),
    doc: jest.fn(),
  }),
}));
