import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase';

/**
 * Initialize Firebase App Check using the JS SDK only.
 * Native attestation (@react-native-firebase) removed for Expo 55 compatibility.
 * Falls back gracefully — app works without App Check, just without the extra security layer.
 */
export async function initAppCheck(): Promise<void> {
  try {
    if (__DEV__) {
      // In dev, set the debug token for App Check
      // @ts-ignore
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(
        process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY || 'placeholder'
      ),
      isTokenAutoRefreshEnabled: true,
    });

    console.log('App Check initialized (JS SDK)');
  } catch (err) {
    // Non-fatal — app still works without App Check
    console.warn('App Check initialization failed:', err);
  }
}
