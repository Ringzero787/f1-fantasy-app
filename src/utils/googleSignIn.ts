import Constants from 'expo-constants';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Export a no-op implementation for Expo Go
export const GoogleSignInService = {
  isAvailable: !isExpoGo,

  configure: (_config: any) => {
    if (isExpoGo) {
      console.log('Google Sign-In not available in Expo Go');
      return;
    }
  },

  signIn: async (): Promise<{ idToken: string | null }> => {
    if (isExpoGo) {
      throw new Error('Google Sign-In not available in Expo Go');
    }

    // Only import and use when not in Expo Go
    const { GoogleSignin, isSuccessResponse } = require('@react-native-google-signin/google-signin');

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (isSuccessResponse(response)) {
      return { idToken: response.data.idToken };
    }

    return { idToken: null };
  },

  configureAndSignIn: async (webClientId: string): Promise<string> => {
    if (isExpoGo) {
      throw new Error('Google Sign-In not available in Expo Go');
    }

    const { GoogleSignin, isSuccessResponse } = require('@react-native-google-signin/google-signin');

    GoogleSignin.configure({
      webClientId,
      offlineAccess: true,
      scopes: ['profile', 'email'],
    });

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    if (isSuccessResponse(response) && response.data.idToken) {
      return response.data.idToken;
    }

    throw new Error('No ID token received from Google');
  },
};
