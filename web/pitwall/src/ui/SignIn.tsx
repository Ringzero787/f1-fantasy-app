import { useState, type FormEvent } from 'react';
import { GoogleAuthProvider, OAuthProvider, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { DISCLAIMER } from './Shell';

const friendly = (code: string): string => ({
  'auth/invalid-credential': 'That email and password do not match an Undercut account.',
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before it finished.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': 'This address is not enabled for sign-in yet.',
}[code] ?? 'Sign-in did not work. Try again.');

/** Same Undercut account as the app: email and password, Google or Apple. No new account system. */
export function SignIn({ notice }: { notice?: string }) {
  const [email, setEmail] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(friendly((e as { code?: string }).code ?? '')); } finally { setBusy(false); }
  };
  const onSubmit = (e: FormEvent) => { e.preventDefault(); void run(() => signInWithEmailAndPassword(auth(), email.trim(), pw)); };
  return (
    <main className="signin">
      <div className="card">
        <span className="lbl">Undercut · analytics</span>
        <div className="brand"><h1>Pit Wall</h1></div>
        <p style={{ color: 'var(--fg2)', margin: 0, fontFamily: 'var(--disp)', fontSize: 13, lineHeight: 1.6 }}>Sign in with your Undercut account. Your teams and leagues are already here.</p>
        {notice ? <p className="err" role="status">{notice}</p> : null}
        <button type="button" className="btn light" disabled={busy} onClick={() => void run(() => signInWithPopup(auth(), new GoogleAuthProvider()))}>Continue with Google</button>
        <button type="button" className="btn line" disabled={busy} onClick={() => void run(() => signInWithPopup(auth(), new OAuthProvider('apple.com')))}>Continue with Apple</button>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="lbl" htmlFor="pw-email">Email</label>
          <input id="pw-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="lbl" htmlFor="pw-pass">Password</label>
          <input id="pw-pass" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit" className="btn line" disabled={busy}>{busy ? 'Signing in…' : 'Sign in with email'}</button>
        </form>
        {err ? <p className="err" role="alert">{err}</p> : null}
        <p className="mut" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', margin: 0 }}>Signed in with Amazon in the app? Open Pit Wall from your Profile there and you arrive signed in.</p>
        <p className="mut" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', margin: 0 }}>{DISCLAIMER}</p>
      </div>
    </main>
  );
}
