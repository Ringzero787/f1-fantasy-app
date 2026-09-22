/**
 * App-to-web sign-in (ARCHITECTURE section 3). The app opens `/h#<code>&src=profile`; the code is
 * single-use, lives 60 seconds and rides in the fragment, which browsers never send to a server.
 */
import { signInWithCustomToken } from 'firebase/auth';
import { auth, callable } from './firebase';

export function parseHandoffFragment(hash: string): { code: string | null; src: string | null } {
  const raw = hash.replace(/^#/, '');
  if (!raw) return { code: null, src: null };
  const [code, ...rest] = raw.split('&');
  const src = new URLSearchParams(rest.join('&')).get('src');
  return { code: /^[A-Za-z0-9_-]{32,128}$/.test(code) ? code : null, src: src && /^[a-z_]{1,24}$/.test(src) ? src : null };
}

export async function redeemHandoff(code: string): Promise<void> {
  const redeem = await callable<{ code: string }, { token: string }>('pw-redeemPortalHandoff');
  const res = await redeem({ code });
  await signInWithCustomToken(auth(), res.data.token);
}
