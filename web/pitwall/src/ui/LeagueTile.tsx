/**
 * The league your team is in (F-114): name, size, your rank and movement, and the standings —
 * the table the app's league screen shows, read from the same documents. Free: it is the player's
 * own league. The example payload (and so the preview build the scroll budget measures) renders a
 * fixed example league with no request; a signed-in team without a league gets a pointer to the app.
 * Collapsed to the top five plus your row (on a phone, to one line); "Show all" opens it.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state';
import { auth } from '../lib/firebase';
import { hasFirebaseConfig } from '../lib/env';
import { loadLeagueStandings } from '../lib/leagueApi';
import { exampleStandings, moveLabel, visibleRows, type LeagueStandings } from '../data/leagueStandings';
import { Lbl, Pill } from './bits';

export function LeagueTile() {
  const { payload: p, real } = useStore();
  const uid = hasFirebaseConfig ? auth().currentUser?.uid ?? null : null;
  const leagueId = real?.team.leagueId ?? null;
  const [st, setSt] = useState<LeagueStandings | 'loading' | null>('loading');
  const [all, setAll] = useState(false);
  const active = !!uid && !!leagueId && !!real && !p.example;

  useEffect(() => {
    let live = true;
    setAll(false);
    if (!active || !uid || !leagueId) { setSt(null); return; }
    setSt('loading');
    loadLeagueStandings(leagueId, uid).then((s) => { if (live) setSt(s); }).catch(() => { if (live) setSt(null); });
    return () => { live = false; };
  }, [active, uid, leagueId]);

  const example = p.example || !real || !uid;
  if (!example && !leagueId) {
    return (
      <section className="tile" aria-label="Your league">
        <div className="th"><Lbl>League</Lbl></div>
        <span className="mut">{real?.team.name ?? 'Your team'} is not in a league yet. Join or create one from the app, and the table appears here.</span>
      </section>
    );
  }
  const shown: LeagueStandings | 'loading' | null = example ? exampleStandings() : st;
  if (shown === 'loading') return <section className="tile" aria-label="Your league"><div className="th"><Lbl>League</Lbl></div><span className="mut">Loading the table…</span></section>;
  if (!shown) return <section className="tile" aria-label="Your league"><div className="th"><Lbl>League</Lbl></div><span className="mut">The league could not be read. Open it in the app to check your membership.</span></section>;
  const st_ = shown;

  const rows = visibleRows(st_.rows, all);
  const me = st_.me;
  return (
    <section className={`tile ${me ? 'you' : ''}`} aria-label={`Your league: ${st_.name}`}>
      <div className="th">
        <Lbl>{st_.name}</Lbl>
        <span className="srow">
          {me ? <Pill red={me.rank === 1}>{`P${me.rank} of ${st_.size}`}{me.move ? ` · ${moveLabel(me.move)}` : ''}</Pill> : <span className="mut">{st_.size} team{st_.size === 1 ? '' : 's'}</span>}
          {st_.max ? <span className="mut only-wide">{st_.size} of {st_.max} seats</span> : null}
        </span>
      </div>
      {/* a phone gets one line until "Show all": the Lab stacks this tile above the swap tiles there, and the slot-open state sits at the scroll budget */}
      {!all ? <span className="mut only-narrow">{st_.rows[0] ? `${st_.rows[0].team} leads on ${st_.rows[0].points.toLocaleString()}` : 'No results yet'}{me && me.rank > 1 ? ` · you are on ${me.points.toLocaleString()}` : ''}. Show all for the table.</span> : null}
      <div className={`scroll ${all ? '' : 'only-wide'}`}><table>
        <thead><tr><th scope="col">#</th><th scope="col" style={{ textAlign: 'left' }}>Team</th><th scope="col">Pts</th><th scope="col" className="only-wide">Last</th><th scope="col"><span className="visually-hidden">Moonshot points</span><span aria-hidden="true">🚀</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId} className={r.me ? 'me' : ''}>
              <td className="num">{r.rank}{r.move ? <span className={r.move > 0 ? 'red' : 'mut'}> {moveLabel(r.move)}</span> : null}</td>
              <td style={{ textAlign: 'left' }}><b>{r.team}</b> <span className="mut">{r.manager}{r.wins ? ` · ${r.wins} win${r.wins === 1 ? '' : 's'}` : ''}</span></td>
              <td className="num">{r.points.toLocaleString()}</td>
              <td className="num only-wide">{r.lastRace == null ? '—' : r.lastRace}</td>
              <td className="num">{r.moonshot ? (r.moonshot > 0 ? `+${r.moonshot}` : String(r.moonshot)) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {st_.rows.length > 5 ? (
        <button type="button" className="chip" style={{ alignSelf: 'flex-start' }} aria-pressed={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show top five' : `Show all ${st_.rows.length}`}
        </button>
      ) : null}
    </section>
  );
}
