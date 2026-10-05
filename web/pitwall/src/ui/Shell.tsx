import { useEffect, useState, type ReactNode } from 'react';
import { bank, money, projectedLineup } from '../data/logic';
import type { Account } from '../lib/account';
import { aceFreezeLine, asOfLabel, isStale } from '../lib/lock';
import { PAGES, type PageName } from '../lib/router';
import { toggleTheme } from '../lib/theme';
import { useStore } from '../state';
import { Pill } from './bits';

export const DISCLAIMER = 'Unofficial. Not affiliated with any racing series, team or governing body. Model estimates, not odds.';

/** Sticky context bar: round, session state, lock countdown, the user's team and bank. It drives every page. */
export function ContextBar({ page, account, onSignOut }: { page: PageName; account: Account | null; onSignOut?: () => void }) {
  const { payload: p, ui, go } = useStore();
  // F-103: both deadlines below are compared against the clock, and nothing else in this bar
  // re-renders on its own — so an idle tab would have sat on "Locks in 00h 01m" straight past
  // the lock. Thirty seconds is finer than the smallest unit either line shows.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const round = account?.roundLabel ?? `RD ${p.round.number} · ${p.round.name.toUpperCase()}`;
  return (
    <header className="ctx">
      <div className="ctxrow">
        <div className="brand"><h1>Pit Wall</h1><span className="lbl only-wide">Undercut · analytics</span>{p.example ? <Pill red>Example data</Pill> : null}</div>
        <div className="grp">
          <span className={`only-wide ${isStale(p.asOf, new Date()) ? 'red' : 'mut'}`} title={isStale(p.asOf, new Date()) ? 'The worker has not published for more than a day' : undefined}>Data as of {asOfLabel(p.asOf)}{isStale(p.asOf, new Date()) ? ' · stale' : ''}</span>
          <button className="ghost" type="button" onClick={() => toggleTheme()}>Light / dark</button>
          {onSignOut ? <button className="ghost" type="button" onClick={onSignOut}>Sign out</button> : null}
        </div>
      </div>
      <div className="ctxrow">
        <div className="grp"><span>{round}</span><span className="mut only-wide">{account?.firstSession ?? p.round.firstSession}</span>{(() => {
            // F-103: two signals, because neither alone is enough. `lineupLocked` is the team's
            // own isLocked, which the sweep stamps up to an hour BEFORE qualifying — but it is
            // read once at sign-in, so a session already open when the sweep runs never sees it.
            // The deadline is therefore also checked against the clock at render time, the way
            // the ace line is. Earliest of the two wins; both fail towards "locked".
            const l = account?.locksIn ?? p.round.locksIn;
            const past = account?.locksAtMs != null && Date.now() >= account.locksAtMs;
            const shut = account?.lineupLocked === true || past || l === 'LOCKED';
            return <span className="red">{shut ? 'Lineups locked' : `Locks in ${l}`}</span>;
          })()}
          {/* F-098/F-102: on a sprint weekend the lineup locks on Friday and the ace survives
              until Saturday's sprint, so "Lineups locked" on its own reads as though everything is
              settled. aceFreezeLine returns null once the moment has passed and on any weekend
              where the ace and the roster lock coincide, so this is sprint-weekends-only without
              asking the question here. The moment is NOT hidden on a narrow screen — it is the
              part worth reading, and the hover explanation is unreachable on touch. */}
          {(() => {
            const a = aceFreezeLine(account?.aceFreezesAtMs ?? null, new Date());
            return a ? <span className="warn" title={`Three sessions score with the Ace applied — the sprint, qualifying and the race. It freezes when the first of them begins, and moves again once the sprint and qualifying have both been scored. This weekend that is ${a.at}.`}>Ace freezes {a.at} <span className="mut">· in {a.in}</span></span> : null;
          })()}</div>
        <div className="grp">
          <span className="mut">Team</span><span>{account?.teamName ?? (account ? 'No team yet' : 'Late Brakers')}</span>
          <span className="mut">Bank</span><span className="num">{account ? (account.bank === null ? '—' : money(account.bank)) : money(bank(p, ui.lineup))}</span>
          <span className="mut only-wide">Proj</span><span className="num only-wide">{(() => { const q = projectedLineup(p, ui.lineup); return q.complete ? `${q.points} pts` : '—'; })()}</span>
        </div>
      </div>
      <nav className="tabs" role="tablist" aria-label="Pit Wall pages">
        {PAGES.map((x) => <button key={x} type="button" role="tab" aria-selected={page === x} onClick={() => go(x)}>{x}</button>)}
      </nav>
    </header>
  );
}

/** Footer: the live scroll budget (no page may pass three screens) and the unofficial notice. */
export function Footer({ page }: { page: PageName }) {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    const measure = () => setRatio(document.documentElement.scrollHeight / window.innerHeight);
    const id = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    const obs = new ResizeObserver(measure); obs.observe(document.body);
    return () => { window.cancelAnimationFrame(id); window.removeEventListener('resize', measure); obs.disconnect(); };
  }, [page]);
  return (
    <footer className="foot">
      <span data-scroll-ratio={ratio.toFixed(2)}>Scroll budget · {ratio.toFixed(1)} / 3.0 screens {ratio <= 3 ? <span className="pos">✓ within</span> : <span className="red">over</span>}</span>
      <span>{DISCLAIMER}</span>
    </footer>
  );
}

export const Toast = () => { const { ui } = useStore(); return ui.toast ? <div id="toast" role="status">{ui.toast}</div> : null; };
export const Wrap = ({ children }: { children: ReactNode }) => <div className="wrap">{children}</div>;
