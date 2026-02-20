import appCheckModule from '@react-native-firebase/app-check';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
import { app } from './firebase';

/**
 * Initialize Firebase App Check on both the native (@react-native-firebase)
 * and JS (firebase/) SDKs.
 *
 * The native module handles platform attestation (Play Integrity on Android,
 * App Attest on iOS). We bridge the token to the JS SDK via a CustomProvider
 * so httpsCallable / Firestore / Storage calls include the App Check header.
 *
 * Call this once at app startup (before any protected Firebase calls).
 */
export async function initAppCheck(): Promise<void> {
  try {
    // 1. Configure native App Check provider
    const rnProvider = appCheckModule().newReactNativeFirebaseAppCheckProvider();
    rnProvider.configure({
      android: {
        provider: __DEV__ ? 'debug' : 'playIntegrity',
      },
      apple: {
        provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback',
      },
    });

    await appCheckModule().initializeAppCheck({
      provider: rnProvider,
      isTokenAutoRefreshEnabled: true,
    });

    // 2. Bridge native tokens to JS SDK so httpsCallable/Firestore/Storage
    //    include the X-Firebase-AppCheck header automatically
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const { token } = await appCheckModule().getToken(false);
          // The JS SDK expects an expireTimeMillis. We don't have the exact
          // expiry from the native module, so use 1 hour from now.
          return {
            token,
            expireTimeMillis: Date.now() + 60 * 60 * 1000,
          };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });

    console.log('App Check initialized');
  } catch (err) {
    // Non-fatal — app still works, just without App Check protection
    console.warn('App Check initialization failed:', err);
  }
}
