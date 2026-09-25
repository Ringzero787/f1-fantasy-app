import { useEffect, useState, type ReactNode } from 'react';
import { bank, money, projectedLineup } from '../data/logic';
import type { Account } from '../lib/account';
import { asOfLabel } from '../lib/lock';
import { PAGES, type PageName } from '../lib/router';
import { toggleTheme } from '../lib/theme';
import { useStore } from '../state';
import { Pill } from './bits';

export const DISCLAIMER = 'Unofficial. Not affiliated with any racing series, team or governing body. Model estimates, not odds.';

/** Sticky context bar: round, session state, lock countdown, the user's team and bank. It drives every page. */
export function ContextBar({ page, account, onSignOut }: { page: PageName; account: Account | null; onSignOut?: () => void }) {
  const { payload: p, ui, go } = useStore();
  const round = account?.roundLabel ?? `RD ${p.round.number} · ${p.round.name.toUpperCase()}`;
  return (
    <header className="ctx">
      <div className="ctxrow">
        <div className="brand"><h1>Pit Wall</h1><span className="lbl only-wide">Undercut · analytics</span>{p.example ? <Pill red>Example data</Pill> : null}</div>
        <div className="grp">
          <span className="mut only-wide">Data as of {asOfLabel(p.asOf)}</span>
          <button className="ghost" type="button" onClick={() => toggleTheme()}>Light / dark</button>
          {onSignOut ? <button className="ghost" type="button" onClick={onSignOut}>Sign out</button> : null}
        </div>
      </div>
      <div className="ctxrow">
        <div className="grp"><span>{round}</span><span className="mut only-wide">{account?.firstSession ?? p.round.firstSession}</span>{(() => { const l = account?.locksIn ?? p.round.locksIn; return <span className="red">{l === 'LOCKED' ? 'Lineups locked' : `Locks in ${l}`}</span>; })()}</div>
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
