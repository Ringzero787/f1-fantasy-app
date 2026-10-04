import { LINEUP_DRIVER_SLOTS, entity, shortName, shortTeamName } from '../data/logic';
import { isCtor } from '../data/types';
import { useStore } from '../state';
import { Arrow, Pill, TeamBar } from './bits';

/**
 * The lineup as six tiles beside the wire (F-097 stage 4), mirroring the app's Team screen:
 * number, projected points, name, team bar and the predicted price move. Read-only here; a tile
 * opens the pick's detail, and the edit link goes to the Lineup Lab, which owns the swaps.
 *
 * Desktop only: on a phone the lineup is one tap away in the Lab and the Briefing has no room for
 * it inside the scroll budget.
 */
export function LineupTiles() {
  const { payload: p, ui, has, real, open, go } = useStore();
  const seats = [...ui.lineup.drivers];
  while (seats.length < LINEUP_DRIVER_SLOTS) seats.push('');
  const ids = [...seats, ...(ui.lineup.ctor ? [ui.lineup.ctor] : [])];
  const ace = ui.lineup.ace ? entity(p, ui.lineup.ace) : undefined;
  return (
    <section className="tile only-wide" aria-label="Your lineup">
      <div className="th">
        <h2 className="h2 calls-h">Lineup</h2>
        <span className="srow">
          {real?.team.isLocked ? <span className="lbl">Locked</span> : null}
          <button type="button" className="linkish lbl red" onClick={() => go('LINEUP LAB')}>Edit →</button>
        </span>
      </div>
      <div className="ltiles">
        {ids.map((id, i) => {
          if (!id) return <button key={`open-${i}`} type="button" className="ltile open" onClick={() => go('LINEUP LAB')} aria-label="Open seat. Fill it in the Lineup Lab"><span className="mut">OPEN SEAT</span><span className="mut">Fill it in the Lab →</span></button>;
          const e = entity(p, id);
          if (!e) return <div key={id} className="ltile mut">{id}</div>;
          const ctor = isCtor(e);
          return (
            <button key={id} type="button" className={`ltile ${ctor ? 'ctor' : ''}`} onClick={() => open(id)} aria-label={`${e.name}, projected ${e.med} points. Open detail`}>
              <span className="ltile-top">
                <span className={`num ${ctor ? 'red' : 'mut'}`}>{ctor ? 'TEAM' : e.num}{!ctor && id === ui.lineup.ace ? <> <Pill red>Ace</Pill></> : null}</span>
                <span className="num"><b>{e.med}</b></span>
              </span>
              <span className="ltile-name">{ctor ? shortTeamName(e.name, e.id) : shortName(e.name)}</span>
              <span className="ltile-foot"><TeamBar p={p} team={e.team} />{has.priceModel && !ctor ? <span className="num"><Arrow n={e.dprice} /></span> : <span className="mut">—</span>}</span>
            </button>
          );
        })}
      </div>
      {ace ? <div className="srow"><Pill red>Ace</Pill><span className="ltile-ace">{ace.name} · 2× points</span></div> : null}
      <span className="mut" style={{ fontSize: 11 }}>Projected points this round; the arrow is the predicted price move.</span>
    </section>
  );
}
