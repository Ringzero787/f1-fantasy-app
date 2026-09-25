import { entity } from '../data/logic';
import { NOT_PUBLISHED } from '../data/coverage';
import { useStore } from '../state';
import { AsTable, Empty, Meter, Row, TeamBar, Tile } from '../ui/bits';
import { Locked } from '../ui/Locked';

const CLASS: Record<string, string> = { street: 'street circuit', permanent: 'permanent circuit', 'high-speed': 'high speed', 'medium-speed': 'medium speed', 'low-speed': 'low speed' };

/**
 * The circuit report (F-072 first cut). The profile is our characteristics table; the fit ranking
 * and "at circuits like this one" are this season's results cut by the venue's classes. Nothing
 * on the page is drawn from the row order: without a published report it says so.
 */
export function Circuit() {
  const { payload: p, has, open, ui } = useStore();
  const c = p.circuit;
  if (!has.circuit || !c) {
    return (
      <div className="page">
        <Tile span="c12" label={`${p.round.circuit || 'Circuit'} · report`}>
          <Empty>{NOT_PUBLISHED.circuit} The venue profile, the car fit ranking and this season's results at circuits like it arrive with the next projection run.</Empty>
        </Tile>
      </div>
    );
  }
  const classes = c.classes.map((k) => CLASS[k] ?? k).join(' · ');
  const like = c.likeThis.filter((x) => x.n > 0);
  return (
    <div className="page">
      <Tile span="c4" label={`${c.name} · profile`} right={<span className="mut">{classes}</span>}>
        <div className="list">
          {c.profile.map((x) => <Row key={x.label} cols="1fr 90px 34px" dense label={`${x.label} ${x.v} of 5`}><span>{x.label}</span><Meter pct={x.v * 20} /><span className="num">{x.v}/5</span></Row>)}
          <Row two cols="1fr auto" dense><span>Lap</span><span className="num">{c.lapKm} km · {c.laps} laps</span></Row>
          <Row two cols="1fr auto" dense><span>Pit loss</span><span className="num">{c.pitLossS} s</span></Row>
          <Row two cols="1fr auto" dense><span>Typical strategy</span><span>{c.strategy}</span></Row>
        </div>
        <span className="mut">Ratings are our circuit characteristics table, 1 to 5.</span>
      </Tile>
      <Tile span="c4" label="Car fit · this kind of circuit">
        <Locked feature="circuit.fit">
          {c.fitRanking.length === 0 ? <Empty>No fit ranking published for this venue.</Empty> : (
            <div className="list">
              {c.fitRanking.map((f, i) => { const e = entity(p, f.id); return e ? (
                <Row key={f.id} cols="20px 1fr 90px 30px" dense onClick={() => open(f.id)} label={`${e.name}, fit ${f.fit} of 5 from ${f.n} races`}>
                  <span className="mut">{i + 1}</span><span><TeamBar p={p} team={f.id} />{e.name}{f.n < 2 ? <span className="mut"> · few races</span> : null}</span><Meter pct={f.fit * 20} /><span className="num">{f.fit}</span>
                </Row>
              ) : null; })}
            </div>
          )}
          <span className="mut">Points at {classes} circuits against points everywhere this season. 3 is neutral; a car with fewer than two races in the class stays at 3.</span>
        </Locked>
      </Tile>
      <Tile span="c4" label="At circuits like this one · this season" right={<span className="mut">{c.racesInClass} race{c.racesInClass === 1 ? '' : 's'}</span>}>
        {like.length === 0 ? <Empty>No race of this class has been run this season yet.</Empty> : (
          <div className="list">
            {like.slice(0, 12).map((x) => { const e = entity(p, x.id); return e ? (
              <Row key={x.id} cols="1fr auto auto" dense onClick={() => open(x.id)} label={`${e.name}: ${x.avgPts} points on average, finishes P${x.avgFinish}, over ${x.n} races`}>
                <span><TeamBar p={p} team={e.team} />{e.name}{ui.lineup.drivers.includes(x.id) ? <span className="mut"> · yours</span> : null}</span><span className="mut num">P{x.avgFinish}</span><span className="num">{x.avgPts} pts</span>
              </Row>
            ) : null; })}
          </div>
        )}
        <AsTable caption="At circuits like this one" head={['Driver', 'Races', 'Avg points', 'Avg finish']} rows={like.map((x) => [entity(p, x.id)?.name ?? x.id, x.n, x.avgPts, x.avgFinish])} />
      </Tile>
    </div>
  );
}
