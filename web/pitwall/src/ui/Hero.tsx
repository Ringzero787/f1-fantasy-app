import { bank, money, projectedLineup, rateMyTeam } from '../data/logic';
import { useStore } from '../state';
import { Lbl } from './bits';

/**
 * The Briefing opener from the 2026-10-04 handoff: the team's name and season numbers on the
 * left, the weekend card on the right. Briefing-only; the sticky shell above it is shared by every
 * page and does not change.
 *
 * Every number is the real team's or a dash. The example payload is the one place example
 * figures are allowed, and the page already carries the EXAMPLE DATA pill when it is in use.
 */
export function Hero() {
  const { payload: p, has, ui, real, pass, go, selectTeam } = useStore();
  const proj = projectedLineup(p, ui.lineup);
  const example = !real && p.example;
  const name = real?.team.name ?? (example ? 'Late Brakers' : null);
  // The season total is the active roster's points plus what departed picks banked (the app's
  // totalPoints + lockedPoints model); the portal has no last-race figure for a real team yet.
  const season = real ? real.team.totalPoints + real.team.lockedPoints : example ? 2473 : null;
  const lastRace = example ? 259 : null;
  const rank = has.league && p.league.myRank > 0 ? { n: p.league.myRank, of: p.league.size } : null;
  const purse = real ? real.team.budget : example ? bank(p, ui.lineup) : null;
  const flags = ui.lineup.drivers.filter((id) => p.news.some((n) => n.entity === id && n.kind === 'PENALTY')).length;
  const dash = <span className="mut">—</span>;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const low = Math.round(proj.points * 0.72), high = Math.round(proj.points * 1.3);
  const marker = high > low ? ((proj.points - low) / (high - low)) * 100 : 50;
  return (
    <section className="hero c12" aria-label="Your team this season">
      <div className="hero-main">
        <div>
          <h1 className="hero-name">{name ?? 'No team yet'}</h1>
          {real && real.teams.length > 1 ? (
            <div className="hero-teams" role="tablist" aria-label="Your teams">
              {real.teams.map((t) => <button key={t.id} type="button" role="tab" aria-selected={t.id === real.team.id} onClick={() => selectTeam(t.id)}><i aria-hidden="true" />{t.name}</button>)}
            </div>
          ) : null}
        </div>
        <div className="hero-stats">
          <div className="hero-stat lead"><Lbl>Season pts</Lbl><span className="hero-num num">{season === null ? dash : fmt(season)}</span></div>
          <div className="hero-stat"><Lbl>Last race</Lbl><span className="hero-num sm num red">{lastRace === null ? dash : `+${fmt(lastRace)}`}</span></div>
          <div className="hero-stat"><Lbl>Rank</Lbl><span className="hero-num sm num">{rank ? <>{rank.n}<span className="mut hero-of">/{rank.of}</span></> : dash}</span></div>
          <div className="hero-stat"><Lbl>Bank</Lbl><span className="hero-num sm num">{purse === null ? dash : money(purse)}</span></div>
        </div>
      </div>
      <div className="weekend" role="group" aria-label="This weekend">
        <div className="th"><span className="lbl red">This weekend</span><Lbl>Projected</Lbl></div>
        {proj.complete ? (
          <>
            <div className="weekend-proj"><span className="hero-num num">{proj.points}</span><span className="mut">PTS · RANGE {low}–{high}</span></div>
            <div className="weekend-range" aria-hidden="true"><i style={{ left: `${marker}%` }} /></div>
          </>
        ) : (
          <p className="mut" style={{ margin: 0, fontFamily: 'var(--disp)', fontSize: 13, lineHeight: 1.5 }}>
            {pass.access === 'pass'
              ? `No projected total: ${proj.missing} of your picks ${proj.missing === 1 ? 'is' : 'are'} not projected for this round.`
              : `No projected total: the free view carries only the top ten, and ${proj.missing} of your picks ${proj.missing === 1 ? 'is' : 'are'} outside it. The whole board comes with the pass.`}
          </p>
        )}
        <div className="list">
          <div className="row two" style={{ gridTemplateColumns: '1fr auto' }}><span className="fg2">Rate my team</span><span className="num"><b>{proj.complete ? `${rateMyTeam(p, ui.lineup)} / 100` : '—'}</b></span></div>
          <div className="row two" style={{ gridTemplateColumns: '1fr auto' }}><span className="fg2">Flags</span><span className={flags || proj.open ? 'red' : 'mut'}>{flags} penalty risk · {proj.open} open slot{proj.open === 1 ? '' : 's'}</span></div>
        </div>
        <button className="cta lg" type="button" onClick={() => go('LINEUP LAB')}>Open lineup lab →</button>
      </div>
    </section>
  );
}
