import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

const AMAZON_CLIENT_ID = process.env.EXPO_PUBLIC_AMAZON_CLIENT_ID!;
const REDIRECT_URI = 'https://www.humannpc.com/undercut/auth/amazon';

// Resolve function stored here so the deep link handler can call it
let _resolve: ((value: { code: string; redirectUri: string }) => void) | null = null;
let _reject: ((reason: Error) => void) | null = null;

/**
 * Called from _layout.tsx when a theundercut://auth/amazon deep link arrives
 */
export function handleAmazonDeepLink(url: string) {
  const codeMatch = url.match(/[?&]code=([^&]+)/);
  if (codeMatch && _resolve) {
    _resolve({ code: codeMatch[1], redirectUri: REDIRECT_URI });
    _resolve = null;
    _reject = null;
    WebBrowser.dismissBrowser();
  } else if (_reject) {
    _reject(new Error('No auth code received'));
    _resolve = null;
    _reject = null;
  }
}

export async function amazonSignIn(): Promise<{
  code: string;
  redirectUri: string;
}> {
  const authUrl =
    'https://www.amazon.com/ap/oa' +
    '?client_id=' + encodeURIComponent(AMAZON_CLIENT_ID) +
    '&scope=profile' +
    '&response_type=code' +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);

  return new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;

    WebBrowser.openBrowserAsync(authUrl).then((result) => {
      // If browser was dismissed without a deep link
      if (result.type === 'cancel' && _reject) {
        _reject(new Error('Sign in cancelled'));
        _resolve = null;
        _reject = null;
      }
    });
  });
}
