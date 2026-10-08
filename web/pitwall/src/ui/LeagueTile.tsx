/**
 * The league your team is in (F-114): name, size, your rank and movement, and the standings —
 * the table the app's league screen shows, read from the same documents. Free: it is the player's
 * own league. The example payload (and so the preview build the scroll budget measures) renders a
 * fixed example league with no request; a signed-in reader renders nothing until their team has
 * loaded (like the Moonshot tile), and a team without a league gets a pointer to the app.
 * Collapsed to the top five plus your row (on a phone, to one line); the chip opens the table.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state';
import { auth } from '../lib/firebase';
import { hasFirebaseConfig } from '../lib/env';
import { loadLeagueStandings } from '../lib/leagueApi';
import { exampleStandings, moveLabel, visibleRows, type LeagueStandings } from '../data/leagueStandings';
import { Lbl, Pill } from './bits';
import { can } from '../data/access';

const EXAMPLE = exampleStandings();

export function LeagueTile() {
  const { payload: p, real, pass } = useStore();
  const uid = hasFirebaseConfig ? auth().currentUser?.uid ?? null : null;
  const leagueId = real?.team.leagueId ?? null;
  const [st, setSt] = useState<LeagueStandings | 'loading' | null>('loading');
  const [all, setAll] = useState(false);
  // only the example payload shows the example league: a signed-in reader whose team has not
  // loaded yet, or who owns none, must not see a fake table that then swaps or never goes away
  const example = p.example || !hasFirebaseConfig;
  const active = !example && !!uid && !!leagueId;

  useEffect(() => {
    let live = true;
    setAll(false);
    if (!active || !uid || !leagueId) { setSt(null); return; }
    setSt('loading');
    loadLeagueStandings(leagueId, uid).then((s) => { if (live) setSt(s); });
    return () => { live = false; };
  }, [active, uid, leagueId]);

  // free by key, not by omission: the player's own league is never behind the pass
  if (!can(pass, 'league.standings')) return null;
  if (!example && (!real || !uid)) return null;
  if (!example && !leagueId) {
    return (
      <section className="tile" aria-label="Your league">
        <div className="th"><Lbl>League</Lbl></div>
        <span className="mut">{real?.team.name ?? 'Your team'} is not in a league yet. Join or create one from the app, and the table appears here.</span>
      </section>
    );
  }
  const shown = example ? EXAMPLE : st;
  if (shown === 'loading') return <section className="tile" aria-label="Your league"><div className="th"><Lbl>League</Lbl></div><span className="mut">Loading the table…</span></section>;
  if (!shown) return <section className="tile" aria-label="Your league"><div className="th"><Lbl>League</Lbl></div><span className="mut">The league could not be read. Open it in the app to check your membership.</span></section>;

  const rows = visibleRows(shown.rows, all);
  const me = shown.me;
  const lead = shown.rows[0];
  const many = shown.rows.length > 5;
  return (
    <section className="tile" aria-label={`Your league: ${shown.name}`}>
      <div className="th">
        <Lbl>{shown.name}</Lbl>
        <span className="srow">
          {me ? <Pill red={me.rank === 1}>{`P${me.rank} of ${shown.size}`}{me.move != null ? ` · ${moveLabel(me.move)}` : ''}</Pill> : <span className="mut">{shown.size} team{shown.size === 1 ? '' : 's'}</span>}
          {shown.max ? <span className="mut only-wide">{shown.size} of {shown.max} seats</span> : null}
        </span>
      </div>
      {/* a phone gets one line until the chip opens the table: the Lab stacks this tile above the swap tiles there, and the slot-open state sits at the scroll budget */}
      {!all ? <span className="mut only-narrow">{lead ? `${lead.team} leads on ${lead.points.toLocaleString()}` : 'No results yet'}{me && me.rank > 1 ? ` · you are on ${me.points.toLocaleString()}` : ''}.</span> : null}
      <div id="league-table" className={`scroll ${all ? '' : 'only-wide'}`}><table>
        <thead><tr><th scope="col">#</th><th scope="col" style={{ textAlign: 'left' }}>Team</th><th scope="col">Pts</th><th scope="col" className="only-wide">Last</th><th scope="col"><span className="visually-hidden">Moonshot points</span><span aria-hidden="true">🚀</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className={r.me ? 'me' : ''}>
              <td className="num">{r.rank}{r.move != null ? <span className={r.move > 0 ? 'red' : 'mut'}> {moveLabel(r.move)}</span> : null}</td>
              <td style={{ textAlign: 'left' }}><b>{r.team}</b> <span className="mut">{r.manager}{r.wins ? ` · ${r.wins} win${r.wins === 1 ? '' : 's'}` : ''}</span>{r.me ? <span className="visually-hidden"> (you)</span> : null}</td>
              <td className="num">{r.points.toLocaleString()}</td>
              <td className="num only-wide">{r.lastRace == null ? '—' : r.lastRace}</td>
              <td className="num">{r.moonshot ? (r.moonshot > 0 ? `+${r.moonshot}` : String(r.moonshot)) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {/* more than five teams: the chip toggles the full table everywhere; five or fewer: the table is
          already complete on a wide screen, so the chip exists only for the phone's one-line state */}
      <button type="button" className={`chip ${many ? '' : 'only-narrow'}`} style={{ alignSelf: 'flex-start' }} aria-expanded={all} aria-controls="league-table" onClick={() => setAll((v) => !v)}>
        {all ? 'Collapse' : many ? `Show all ${shown.rows.length}` : 'Show table'}
      </button>
    </section>
  );
}
