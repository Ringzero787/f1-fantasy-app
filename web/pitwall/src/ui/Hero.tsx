import { bank, entity, money, projectedLineup, rateMyTeam } from '../data/logic';
import { PREVIEW } from '../lib/env';
import { useStore } from '../state';
import { NameEditor } from './NameEditor';
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
  const { payload: p, has, ui, real, pass, go, selectTeam, displayName, renameTeam, renameUser, toast } = useStore();
  const proj = projectedLineup(p, ui.lineup);
  // Example figures belong to the preview build only. A signed-in account with no team sees
  // dashes, as the context bar does, even while the worker has not published and the payload is
  // the example set.
  const example = PREVIEW && !real;
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
  // The range is the lineup's own: every pick's floor and ceiling summed, the ace doubled. Drawn
  // only when every pick has a published band, so the marker means something.
  const picks = [...ui.lineup.drivers, ...(ui.lineup.ctor ? [ui.lineup.ctor] : [])].map((id) => entity(p, id));
  const banded = proj.complete && picks.every((e) => e && (e.floor > 0 || e.ceil > 0));
  const mult = (id: string) => (id === ui.lineup.ace ? 2 : 1);
  const low = banded ? picks.reduce((s, e) => s + (e ? e.floor * mult(e.id) : 0), 0) : 0;
  const high = banded ? picks.reduce((s, e) => s + (e ? e.ceil * mult(e.id) : 0), 0) : 0;
  const marker = banded && high > low ? Math.max(0, Math.min(100, ((proj.points - low) / (high - low)) * 100)) : null;
  return (
    <section className="hero c12" aria-label="Your team this season">
      <div className="hero-main">
        <div>
          {/* The team's name and the manager's are editable here (F-100): the app shows the new
              names on its next load, from the same documents. */}
          {name && renameTeam ? <h1 className="hero-name"><NameEditor value={name} label="Team name" inputClassName="hero-input" save={async (n) => { await renameTeam(n); toast(`Team renamed to ${n}.`); }} /></h1> : <h1 className="hero-name">{name ?? 'No team yet'}</h1>}
          {renameUser ? <div className="hero-manager"><span className="lbl">Manager</span><NameEditor value={displayName ?? 'Set your name'} label="Your name" save={async (n) => { await renameUser(n); toast(`Your name is now ${n}.`); }} /></div> : null}
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
            <div className="weekend-proj"><span className="hero-num num">{proj.points}</span><span className="mut">PTS{marker !== null ? ` · RANGE ${low}–${high}` : ''}</span></div>
            {marker !== null ? <div className="weekend-range" role="img" aria-label={`Floor ${low}, projected ${proj.points}, ceiling ${high}`}><i style={{ left: `${marker}%` }} /></div> : null}
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
