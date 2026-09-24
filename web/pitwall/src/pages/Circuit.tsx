import { useStore } from '../state';
import { Empty, Meter, Row, TeamBar, Tile } from '../ui/bits';

export function Circuit() {
  const { payload: p, has, open } = useStore();
  // The venue profile, the car fit ranking and the history table have no published source yet: in
  // the example set they are drawn from the row order. Against a real payload that would be an
  // invention presented as a measurement, so the page says so instead.
  if (!has.mock) {
    return (
      <div className="page">
        <Tile span="c12" label={`${p.round.circuit || 'Circuit'} · report`}>
          <Empty>The circuit report is not published yet. The venue profile, car fit ranking and history at this venue arrive with the reports pipeline.</Empty>
        </Tile>
      </div>
    );
  }
  const profile: Array<[string, number]> = [['Straight-line share', 82], ['Slow-corner share', 64], ['Overtaking ease', 71], ['Safety-car rate', 78], ['Tyre stress', 32]];
  return (
    <div className="page">
      <Tile span="c4" label={`${p.round.circuit} · profile`}>
        {profile.map(([l, v]) => <Row key={l} cols="1fr 90px 34px"><span>{l}</span><Meter pct={v} /><span className="num">{v}</span></Row>)}
        <Row two cols="1fr auto"><span>Pit loss</span><span className="num">20.4 s</span></Row>
        <Row two cols="1fr auto"><span>Typical strategy</span><span>1 stop · M → H</span></Row>
      </Tile>
      <Tile span="c4" label="Car fit ranking">
        {p.constructors.slice(0, 8).map((c, i) => (
          <Row key={c.id} cols="20px 1fr 90px 30px" onClick={() => open(c.id)} label={`${c.name}, fit ${(4.8 - i * 0.4).toFixed(1)} of 5`}>
            <span className="mut">{i + 1}</span><span><TeamBar p={p} team={c.id} />{c.name}</span><Meter pct={92 - i * 9} /><span className="num">{(4.8 - i * 0.4).toFixed(1)}</span>
          </Row>
        ))}
      </Tile>
      <Tile span="c4" label="History at this venue · last 3 visits">
        {p.drivers.slice(0, 8).map((d) => (
          <Row key={d.id} cols="1fr auto auto" onClick={() => open(d.id)} label={`${d.name} at this venue`}>
            <span><TeamBar p={p} team={d.team} />{d.name}</span><span className="mut num">avg P{1 + Math.round(d.q * 6)}</span><span className="num">{Math.round(d.med * 0.9)} pts</span>
          </Row>
        ))}
      </Tile>
    </div>
  );
}
