import { money } from '../data/logic';
import { useStore } from '../state';
import { Arrow, Spark, Tabs, TeamBar, Tile, Tr } from '../ui/bits';

export function Market() {
  const { payload: p, ui, set, open } = useStore();
  let body;
  if (ui.mktTab === 'PRICE MODEL') {
    body = (
      <div className="scroll"><table>
        <thead><tr><th scope="col">Driver</th><th scope="col">Price</th><th scope="col">Pts for +$</th><th scope="col">Pts to hold</th><th scope="col">P(rise)</th><th scope="col">P(fall)</th><th scope="col">Expected</th></tr></thead>
        <tbody>{[...p.drivers].sort((a, b) => b.dprice - a.dprice).slice(0, 14).map((d) => { const pr = Math.max(4, Math.min(92, 50 + d.dprice * 2)); return (
          <Tr key={d.id} onClick={() => open(d.id)} focus={ui.focus === d.id} label={`${d.name} price model`}>
            <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td><td>{money(d.price)}</td><td>{Math.round(d.price / 11 + 6)}</td><td>{Math.round(d.price / 11 - 6)}</td><td>{pr}%</td><td>{Math.max(3, 96 - pr - 12)}%</td><td><Arrow n={d.dprice} /></td>
          </Tr>
        ); })}</tbody>
      </table></div>
    );
  } else if (ui.mktTab === 'VALUE') {
    body = (
      <div className="scroll"><table>
        <thead><tr><th scope="col">Driver</th><th scope="col">Price</th><th scope="col">Pts/$100 season</th><th scope="col">Pts/$100 last 3</th><th scope="col">Price history</th></tr></thead>
        <tbody>{[...p.drivers].sort((a, b) => b.val - a.val).slice(0, 14).map((d) => (
          <Tr key={d.id} onClick={() => open(d.id)} focus={ui.focus === d.id} label={`${d.name} value`}>
            <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td><td>{money(d.price)}</td><td>{d.val}</td><td>{(d.val * (0.8 + d.q / 3)).toFixed(1)}</td>
            <td><Spark values={d.form.map((v, i) => Math.round(d.price * 0.6 + i * d.price * 0.025 + v))} label={`${d.name} price by round`} /></td>
          </Tr>
        ))}</tbody>
      </table></div>
    );
  } else {
    body = (
      <>
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th><th scope="col">Owned in league</th><th scope="col">Effective (ace-weighted)</th><th scope="col">You</th><th scope="col">Class</th></tr></thead>
          <tbody>{[...p.drivers].sort((a, b) => b.own - a.own).slice(0, 14).map((d) => { const me = ui.lineup.drivers.includes(d.id); return (
            <Tr key={d.id} onClick={() => open(d.id)} me={me} focus={ui.focus === d.id} label={`${d.name} ownership`}>
              <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td><td>{d.own}%</td><td>{Math.round(d.own * 1.25)}%</td><td>{me ? '✓' : '—'}</td>
              <td>{!me && d.own > 55 ? <span className="red">THREAT</span> : me && d.own < 30 ? <span className="pos">DIFFERENTIAL</span> : <span className="mut">TEMPLATE</span>}</td>
            </Tr>
          ); })}</tbody>
        </table></div>
        <span className="mut">League: {p.league.name} · {p.league.size} teams. Shown only for leagues you belong to.</span>
      </>
    );
  }
  return <div className="page"><Tile span="c12" label="Market" right={<Tabs value={ui.mktTab} options={['PRICE MODEL', 'VALUE', 'OWNERSHIP'] as const} onChange={(v) => set('mktTab', v)} label="Market views" />}>{body}</Tile></div>;
}
