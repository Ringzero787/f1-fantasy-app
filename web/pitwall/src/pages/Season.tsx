import { entity, money, spent } from '../data/logic';
import { useStore } from '../state';
import { AsTable, Empty, FitCell, Meter, Row, TeamBar, Tile, Tr } from '../ui/bits';
import { NOT_PUBLISHED } from '../data/coverage';
import { Locked } from '../ui/Locked';

/**
 * The season page (F-072 first cut). Schedule difficulty is the circuit fit from the results
 * splits; the season table is points so far plus the median for each remaining round; reliability
 * is retirements from the classifications. The title simulation and the power-unit tracker of the
 * prototype had no source and are gone until one exists.
 */
export function Season() {
  const { payload: p, has, pass, ui, open } = useStore();
  const rows = p.season.map((r) => ({ r, e: entity(p, r.id) })).filter((x): x is { r: typeof x.r; e: NonNullable<typeof x.e> } => !!x.e);
  const paid = pass.access === 'pass';
  const maxProj = Math.max(1, ...rows.map((x) => x.r.projected));
  const retired = rows.filter((x) => x.r.starts > 0).sort((a, b) => b.r.dnfs - a.r.dnfs || a.r.projected - b.r.projected);
  return (
    <div className="page">
      <Tile span="c8" label="Schedule difficulty · next 6 rounds">
        {!has.fit ? <Empty>{NOT_PUBLISHED.fit} Fit comes from each driver's results at circuits of the same class; it needs a few races of the season before it says anything.</Empty> : <>
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th>{p.rounds.map((r) => <th key={r} scope="col">{r}</th>)}<th scope="col">Avg</th></tr></thead>
          <tbody>{p.drivers.slice(0, 12).map((d) => (
            <Tr key={d.id} onClick={() => open(d.id)} me={ui.lineup.drivers.includes(d.id)} focus={ui.focus === d.id} label={`${d.name} schedule`}>
              <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td>{d.fit.map((v, i) => <td key={i}><FitCell v={v} label={p.rounds[i]} /></td>)}<td>{(d.fit.reduce((a, b) => a + b, 0) / d.fit.length).toFixed(1)}</td>
            </Tr>
          ))}</tbody>
        </table></div>
        <span className="mut">Circuit fit 1 to 5 from this season's points at circuits of the same class; 3 is neutral. Brighter is better.</span>
        </>}
      </Tile>
      <Tile span="c4" label="Season table · projected" right={<span className="mut only-wide">Points so far plus the median for each remaining round</span>}>
        {!has.season ? <Empty>{NOT_PUBLISHED.season}</Empty> : (
          <Locked feature="season">
            <div className="list">
              {rows.slice(0, 10).map(({ r, e }, i) => (
                <Row key={r.id} cols="20px 1fr 70px 44px" dense onClick={() => open(r.id)} label={`${e.name}: ${r.points} points so far, projected ${r.projected}`}>
                  <span className="mut">{i + 1}</span><span><TeamBar p={p} team={e.team} />{e.name}{ui.lineup.drivers.includes(r.id) ? <span className="mut"> · yours</span> : null}</span>
                  <Meter pct={(r.projected / maxProj) * 100} /><span className="num">{paid ? r.projected : r.points}</span>
                </Row>
              ))}
            </div>
            <AsTable caption="Season table" head={['Driver', 'Points so far', 'Projected']} rows={rows.map(({ r, e }) => [e.name, r.points, r.projected])} />
          </Locked>
        )}
      </Tile>
      <Tile span="c8" label="Reliability · retirements this season">
        {!has.pace ? <Empty>{NOT_PUBLISHED.pace}</Empty> : (
          <div className="scroll"><table>
            <thead><tr><th scope="col">Driver</th><th scope="col">Starts</th><th scope="col">Retired</th><th scope="col">Points so far</th></tr></thead>
            <tbody>{retired.slice(0, 12).map(({ r, e }) => (
              <Tr key={r.id} onClick={() => open(r.id)} me={ui.lineup.drivers.includes(r.id)} focus={ui.focus === r.id} label={`${e.name}: ${r.dnfs} retirements in ${r.starts} starts`}>
                <td><TeamBar p={p} team={e.team} /><b>{e.name}</b></td><td>{r.starts}</td><td className={r.dnfs >= 3 ? 'red' : r.dnfs ? '' : 'mut'}>{r.dnfs}</td><td>{r.points}</td>
              </Tr>
            ))}</tbody>
          </table></div>
        )}
      </Tile>
      <Tile span="c4" label="Your team value">
        <div className="big num">{money(spent(p, ui.lineup))}</div>
        <span className="mut">{has.league ? `League rank ${p.league.myRank} of ${p.league.size}.` : 'What your lineup is worth at today\'s prices.'}</span>
      </Tile>
    </div>
  );
}
