import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { examplePayload, EXAMPLE_LINEUP } from './data/example';
import { EMPTY_ACCOUNT, loadAccount, type Account } from './lib/account';
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
import { StoreProvider } from './state';
import { Tooltip } from './ui/bits';
import { ContextBar, Footer, Toast, Wrap } from './ui/Shell';
import { SignIn } from './ui/SignIn';
import { CompareTray, SlideOver } from './ui/SlideOver';

const PAGE: Record<PageName, () => ReactElement> = { BRIEFING: Briefing, BOARD: Board, CIRCUIT: Circuit, 'PACE LAB': PaceLab, MARKET: Market, 'LINEUP LAB': LineupLab, SEASON: Season, WIRE: Wire };

function Portal({ account, onSignOut }: { account: Account | null; onSignOut?: () => void }) {
  const [page, go] = usePage();
  const payload = useMemo(() => examplePayload(), []);
  const Page = PAGE[page];
  return (
    <StoreProvider payload={payload} lineup={EXAMPLE_LINEUP} go={go}>
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

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' });
  const [account, setAccount] = useState<Account>(EMPTY_ACCOUNT);

  useEffect(() => {
    if (PREVIEW) return;
    if (!hasFirebaseConfig) { setSession({ state: 'out', notice: 'This build has no sign-in configuration.' }); return; }
    let notice: string | undefined;
    const start = async () => {
      if (isHandoffPath(window.location.pathname)) {
        const { code } = parseHandoffFragment(window.location.hash);
        // Drop the code from the address bar and history before doing anything else.
        window.history.replaceState({}, '', '/');
        if (code) { try { await redeemHandoff(code); } catch { notice = 'That sign-in link has expired or was already used. Sign in below, or open Pit Wall from the app again.'; } }
      }
    };
    let unsub = () => {};
    void start().then(() => { unsub = onAuthStateChanged(auth(), (user) => setSession(user ? { state: 'in', user } : { state: 'out', notice })); });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (session.state !== 'in') return;
    let live = true;
    loadAccount(session.user.uid).then((a) => { if (live) setAccount(a); }).catch(() => { if (live) setAccount(EMPTY_ACCOUNT); });
    return () => { live = false; };
  }, [session]);

  if (PREVIEW) return <Portal account={null} />;
  if (session.state === 'loading') return <main className="signin"><span className="lbl" role="status">Loading…</span></main>;
  if (session.state === 'out') return <SignIn notice={session.notice} />;
  return <Portal account={account} onSignOut={() => void signOut(auth())} />;
}
