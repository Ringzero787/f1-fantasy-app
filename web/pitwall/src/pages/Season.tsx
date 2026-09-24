import { entity, money, spent } from '../data/logic';
import { useStore } from '../state';
import { AsTable, FitCell, Meter, Row, Spark, TeamBar, Tile, Tr } from '../ui/bits';

const LIMITS = [4, 4, 4, 3, 3];

export function Season() {
  const { payload: p, ui, open } = useStore();
  const title: Array<[string, number]> = [['norris', 41], ['verstappen', 33], ['piastri', 19], ['russell', 6], ['leclerc', 1]];
  const value = [1500, 1540, 1610, 1650, 1640, 1720, 1790, 1850, 1900, 1980, 2040, 2100, 2130, 2160, 2180, spent(p, ui.lineup)];
  return (
    <div className="page">
      <Tile span="c8" label="Schedule difficulty · next 6 rounds">
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th>{p.rounds.map((r, i) => <th key={r} scope="col">{r}{i === 2 || i === 4 ? ' ·S' : ''}</th>)}<th scope="col">Avg</th></tr></thead>
          <tbody>{p.drivers.slice(0, 12).map((d) => (
            <Tr key={d.id} onClick={() => open(d.id)} me={ui.lineup.drivers.includes(d.id)} focus={ui.focus === d.id} label={`${d.name} schedule`}>
              <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td>{d.fit.map((v, i) => <td key={i}><FitCell v={v} label={p.rounds[i]} /></td>)}<td>{(d.fit.reduce((a, b) => a + b, 0) / d.fit.length).toFixed(1)}</td>
            </Tr>
          ))}</tbody>
        </table></div>
        <span className="mut">Circuit fit 1 to 5, the number is in every cell and brighter is better. ·S marks sprint weekends.</span>
      </Tile>
      <Tile span="c4" label="Title simulation · 10,000 seasons">
        {title.map(([id, pct]) => { const d = entity(p, id); return d ? (
          <Row key={id} cols="90px 1fr 38px" onClick={() => open(id)} label={`${d.name} ${pct}%`}><span><TeamBar p={p} team={d.team} />{d.name}</span><Meter pct={pct * 2} /><span className="num">{pct}%</span></Row>
        ) : null; })}
      </Tile>
      <Tile span="c8" label="Power unit and penalty tracker">
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th><th scope="col">ICE</th><th scope="col">Turbo</th><th scope="col">MGU-K</th><th scope="col">Energy store</th><th scope="col">Control elec.</th><th scope="col">Status</th></tr></thead>
          <tbody>{['hamilton', 'alonso', 'verstappen', 'sainz', 'ocon', 'gasly'].map((id, i) => { const d = entity(p, id); if (!d) return null;
            const used = LIMITS.map((a, j) => Math.min(a + 1, a - ((i + j) % 3) + 1)); const over = used.some((v, j) => v > LIMITS[j]);
            return (
              <Tr key={id} onClick={() => open(id)} focus={ui.focus === id} label={`${d.name} power unit use`}>
                <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td>
                {used.map((v, j) => <td key={j}><span className="cell" style={{ border: `1px solid ${v >= LIMITS[j] ? 'var(--red)' : 'var(--borderS)'}` }}>{v}/{LIMITS[j]}</span></td>)}
                <td>{over ? <span className="red">⚠ PENALTY TAKEN</span> : i < 3 ? <span style={{ color: 'var(--warn)' }}>▲ AT LIMIT</span> : <span className="mut">OK</span>}</td>
              </Tr>
            ); })}</tbody>
        </table></div>
      </Tile>
      <Tile span="c4" label="Your team value">
        <div className="big num">{money(spent(p, ui.lineup))}</div>
        <Spark values={value} w={300} h={60} label="Team value by round" />
        <span className="mut">+46% since round 1 · league rank {p.league.myRank} of {p.league.size}</span>
        <AsTable caption="Team value by round" head={['Round', 'Value']} rows={value.map((v, i) => [`RD ${i + 1}`, money(v)])} />
      </Tile>
    </div>
  );
}
