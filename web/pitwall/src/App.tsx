import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Lineup, Payload } from './data/types';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { examplePayload, EXAMPLE_LINEUP } from './data/example';
import { EMPTY_ACCOUNT, loadAccount, type Account } from './lib/account';
import { aceChange, planSave, teamLineup, CONTRACT_LENGTH } from './data/team';
import { NO_PASS, passFromClaims, payloadForAccess, type PassState } from './data/access';
import { executePlan, loadMarket, loadTeams, saveErrorText } from './lib/teamApi';
import { loadPayload } from './lib/payloadApi';
import { callable } from './lib/firebase';
import { StoreProvider, type RealContext } from './state';
import { PREVIEW, hasFirebaseConfig } from './lib/env';
import { auth } from './lib/firebase';
import { parseHandoffFragment, redeemHandoff } from './lib/handoff';
import { isHandoffPath, usePage, type PageName } from './lib/router';
import { Board } from './pages/Board';
import { Briefing } from './pages/Briefing';
import { Circuit } from './pages/Circuit';
import { LineupLab } from './pages/LineupLab';
import { Market } from './pages/Market';
import { PaceLab } from './pages/PaceLab';
import { Season } from './pages/Season';
import { Wire } from './pages/Wire';
import { Tooltip } from './ui/bits';
import { ContextBar, DISCLAIMER, Footer, Toast, Wrap } from './ui/Shell';
import { SignIn } from './ui/SignIn';
import { CompareTray, SlideOver } from './ui/SlideOver';

const PAGE: Record<PageName, () => ReactElement> = { BRIEFING: Briefing, BOARD: Board, CIRCUIT: Circuit, 'PACE LAB': PaceLab, MARKET: Market, 'LINEUP LAB': LineupLab, SEASON: Season, WIRE: Wire };

function Portal({ account, real, pass, published, reloadReal, selectTeam, checkoutFn, onSignOut }: { account: Account | null; real: RealContext | null; pass?: PassState; published?: Payload | null; reloadReal?: () => Promise<RealContext | null>; selectTeam?: (id: string) => void; checkoutFn?: () => Promise<string>; onSignOut?: () => void }) {
  const [page, go] = usePage();
  // The published payload when the worker has put one out and the rules let this user read it;
  // the browser-generated example set otherwise, which labels itself on every page.
  const payload = useMemo(() => published ?? examplePayload(), [published]);
  const Page = PAGE[page];
  // With a real team the lineup starts from it (ids the example payload may not know are kept as-is);
  // without one the example lineup stands in.
  const lineup = useMemo(() => (real ? teamLineup(real.team) : EXAMPLE_LINEUP), [real]);
  const saver = real && reloadReal ? async (target: Lineup, onStatus: (s: string | null) => void) => {
    const fresh = (await reloadReal()) ?? real;
    const plan = planSave(fresh.team, target, fresh.market, CONTRACT_LENGTH, fresh.completedRaces);
    const ace = aceChange(fresh.team, target, fresh.market);
    if (plan.blocked) throw new Error(plan.blocked);
    if (ace.blocked) throw new Error(ace.blocked);
    if (!plan.changed && ace.to === null) return target;
    try {
      await executePlan(fresh.team.id, plan, ace.to, (p) => onStatus(p.step ? `Saving ${p.done + 1} of ${p.total}…` : null));
    } catch (e) {
      await reloadReal();
      throw new Error(saveErrorText(e));
    }
    const after = await reloadReal();
    return after ? teamLineup(after.team) : target;
  } : undefined;
  return (
    <StoreProvider key={real?.team.id ?? 'example'} payload={payload} lineup={lineup} real={real} pass={pass} checkoutFn={checkoutFn} selectTeam={selectTeam} saver={saver} go={go}>
      <Wrap>
        <ContextBar page={page} account={account} onSignOut={onSignOut} />
        <main id="main"><Page /></main>
        <CompareTray />
        <Footer page={page} />
      </Wrap>
      <SlideOver /><Tooltip /><Toast />
    </StoreProvider>
  );
}

type Session = { state: 'loading' } | { state: 'out'; notice?: string } | { state: 'in'; user: User };

/**
 * A handoff link never signs anyone in by itself. Someone could send a victim a link carrying the SENDER'S
 * code, and a silent redeem would put the victim's browser into the sender's account (login CSRF), where a
 * later purchase or lineup edit would land on the wrong account. So the code is held in memory, the person
 * is told what is about to happen, and an existing session is only replaced when they say so.
 */
function HandoffGate({ current, busy, onContinue, onDecline }: { current: User | null; busy: boolean; onContinue: () => void; onDecline: () => void }) {
  const who = current ? current.displayName || current.email || 'another account' : null;
  return (
    <main className="signin">
      <div className="card">
        <span className="lbl">Undercut · analytics</span>
        <div className="brand"><h1>Pit Wall</h1></div>
        <p style={{ color: 'var(--fg2)', margin: 0, fontFamily: 'var(--disp)', fontSize: 13, lineHeight: 1.6 }}>
          {who ? `This browser is already signed in as ${who}. The link you opened would switch it to the account signed in on the Undercut app.` : 'You opened Pit Wall from the Undercut app. Continue to sign in here with the same account, without typing a password.'}
        </p>
        <p className="mut" style={{ fontSize: 11, margin: 0 }}>Only continue if you tapped PIT WALL in the app yourself just now. If someone sent you this link, do not continue.</p>
        <button type="button" className="btn light" disabled={busy} onClick={onContinue}>{busy ? 'Signing in…' : who ? 'Switch to the app’s account' : 'Continue'}</button>
        <button type="button" className="btn line" disabled={busy} onClick={onDecline}>{who ? `Stay signed in as ${who}` : 'Sign in another way'}</button>
        <p className="mut" style={{ fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', margin: 0 }}>{DISCLAIMER}</p>
      </div>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const [account, setAccount] = useState<Account>(EMPTY_ACCOUNT);
  const [real, setReal] = useState<RealContext | null>(null);
  const teamIdRef = useRef<string | null>(null);
  const uidRef = useRef<string | null>(null);
  const [pass, setPass] = useState<PassState>(NO_PASS);
  // Tagged with the access it was fetched for: a pass that lapses or a sign-out must not leave a
  // pass-gated payload on screen while the next read is in flight.
  const [published, setPublished] = useState<{ access: PassState['access']; payload: Payload } | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();

  useEffect(() => {
    if (PREVIEW) return;
    if (!hasFirebaseConfig) { setSession({ state: 'out' }); setNotice('This build has no sign-in configuration.'); return; }
    if (isHandoffPath(window.location.pathname)) {
      const { code } = parseHandoffFragment(window.location.hash);
      // Drop the code from the address bar and history before doing anything else; it lives in memory only.
      window.history.replaceState({}, '', '/');
      if (code) setPendingCode(code); else setNotice(EXPIRED);
    }
    return onAuthStateChanged(auth(), (user) => setSession(user ? { state: 'in', user } : { state: 'out' }));
  }, []);

  const uid = session.state === 'in' ? session.user.uid : null;
  uidRef.current = uid;
  const reloadReal = useCallback(async (): Promise<RealContext | null> => {
    if (!uid) return null;
    try {
      const [teams, market] = await Promise.all([loadTeams(uid), loadMarket()]);
      // A sign-out and sign-in while this was in flight must not show one account another's team.
      if (uidRef.current !== uid) return null;
      if (teams.length === 0) { setReal(null); return null; }
      // Keep the chosen team across a reload; fall back to the first when it is gone.
      const next: RealContext = { team: teams.find((t) => t.id === teamIdRef.current) ?? teams[0], teams, market, completedRaces: market.completedRaces };
      teamIdRef.current = next.team.id;
      setReal(next);
      return next;
    } catch { return null; }
  }, [uid]);

  const selectTeam = useCallback((id: string) => {
    teamIdRef.current = id;
    setReal((cur) => (cur ? { ...cur, team: cur.teams.find((t) => t.id === id) ?? cur.team } : cur));
  }, []);
  // The pass comes from the same auth claim the Firestore rules read, so the UI and the rules can
  // never disagree. `getIdTokenResult(true)` forces a refresh, which is what picks up a purchase
  // made moments ago in Stripe.
  const refreshPass = useCallback(async (force = false) => {
    const user = session.state === 'in' ? session.user : null;
    if (!user) { setPass(NO_PASS); return; }
    try {
      const token = await user.getIdTokenResult(force);
      setPass(passFromClaims(token.claims as Record<string, unknown>, Date.now()));
    } catch { setPass(NO_PASS); }
  }, [session]);

  useEffect(() => {
    // Coming back from a successful checkout: the webhook has just written the pass, so force a refresh.
    const paid = new URLSearchParams(window.location.search).has('paid');
    void refreshPass(paid);
    if (paid) window.history.replaceState({}, '', '/');
  }, [refreshPass]);

  // The published payload. Which document it comes from follows the pass, so a purchase swaps the
  // free look for the full one without a reload; the rules refuse the rest either way.
  useEffect(() => {
    if (!uid) { setPublished(null); return; }
    let live = true;
    const access = pass.access;
    void loadPayload(access === 'pass').then((p) => { if (live && p) setPublished({ access, payload: p }); });
    return () => { live = false; };
  }, [uid, pass.access]);

  useEffect(() => {
    if (!uid) { setReal(null); teamIdRef.current = null; return; }
    let live = true;
    loadAccount(uid).then((a) => { if (live) setAccount(a); }).catch(() => { if (live) setAccount(EMPTY_ACCOUNT); });
    void reloadReal();
    return () => { live = false; };
  }, [uid, reloadReal]);

  // The preview build (scroll budget, design review) renders as a pass holder: locked frames keep
  // the same height, so the unlocked layout is the taller case and every control is reachable.
  // The preview build (scroll budget, design review) renders as a pass holder, since locked frames
  // keep the same height and the unlocked layout is the taller case. `?free=1` shows a free user's
  // view for design review. Neither path exists in a production bundle: PREVIEW is build-time.
  if (PREVIEW) {
    const free = new URLSearchParams(window.location.search).has('free');
    return <Portal account={null} real={null} pass={free ? NO_PASS : { access: 'pass', expiresAt: Number.MAX_SAFE_INTEGER, trial: false }} />;
  }
  if (session.state === 'loading') return <main className="signin"><span className="lbl" role="status">Loading…</span></main>;
  if (pendingCode) {
    const code = pendingCode;
    return (
      <HandoffGate current={session.state === 'in' ? session.user : null} busy={redeeming}
        onDecline={() => setPendingCode(null)}
        onContinue={() => { setRedeeming(true); redeemHandoff(code).catch(() => setNotice(EXPIRED)).finally(() => { setRedeeming(false); setPendingCode(null); }); }} />
    );
  }
  if (session.state === 'out') return <SignIn notice={notice} />;
  const checkoutFn = async (): Promise<string> => {
    const create = await callable<Record<string, never>, { url: string }>('pw-createCheckout');
    const res = await create({});
    if (!res.data?.url) throw new Error('Checkout could not be opened. Try again.');
    return res.data.url;
  };
  return <Portal account={account} real={real} pass={pass} published={payloadForAccess(published, pass.access)} reloadReal={reloadReal} selectTeam={selectTeam} checkoutFn={checkoutFn} onSignOut={() => void signOut(auth())} />;
}

const EXPIRED = 'That sign-in link has expired or was already used. Sign in below, or open Pit Wall from the app again.';
