import { money } from '../data/logic';
import { useStore } from '../state';
import { Arrow, Empty, Spark, Tabs, TeamBar, Tile, Tr } from '../ui/bits';
import { NOT_PUBLISHED } from '../data/coverage';
import { LockedPage } from '../ui/Locked';

/** Points per $100 over the last three scored rounds, from the real form series. */
const last3Value = (d: { form: number[]; price: number }): string => {
  const last = d.form.slice(-3);
  if (!last.length || d.price <= 0) return '—';
  return ((last.reduce((a, b) => a + b, 0) / last.length / d.price) * 100).toFixed(1);
};

export function Market() {
  const { payload: p, has, ui, set, open } = useStore();
  let body;
  if (ui.mktTab === 'PRICE MODEL' && !has.priceModel) {
    body = <Empty>{NOT_PUBLISHED.priceModel}</Empty>;
  } else if (ui.mktTab === 'PRICE MODEL') {
    body = (
      <div className="scroll"><table>
        <thead><tr><th scope="col">Driver</th><th scope="col">Price</th><th scope="col">Pts for +$</th><th scope="col">Pts to hold</th><th scope="col">P(rise)</th><th scope="col">P(fall)</th><th scope="col">Expected</th></tr></thead>
        <tbody>{[...p.drivers].sort((a, b) => b.dprice - a.dprice).slice(0, 14).map((d) => (
          <Tr key={d.id} onClick={() => open(d.id)} focus={ui.focus === d.id} label={`${d.name} price model`}>
            <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td><td>{money(d.price)}</td><td>{d.ptsRise}</td><td>{d.ptsHold}</td><td>{d.pRise}%</td><td>{d.pFall}%</td><td><Arrow n={d.dprice} /></td>
          </Tr>
        ))}</tbody>
      </table></div>
    );
  } else if (ui.mktTab === 'VALUE') {
    body = (
      <div className="scroll"><table>
        <thead><tr><th scope="col">Driver</th><th scope="col">Price</th><th scope="col">Pts/$100 season</th><th scope="col">Pts/$100 last 3</th><th scope="col">{has.mock ? 'Price history' : 'Points by round'}</th></tr></thead>
        <tbody>{[...p.drivers].sort((a, b) => b.val - a.val).slice(0, 14).map((d) => (
          <Tr key={d.id} onClick={() => open(d.id)} focus={ui.focus === d.id} label={`${d.name} value`}>
            <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td><td>{money(d.price)}</td><td>{d.val}</td><td>{last3Value(d)}</td>
            <td>{has.mock ? <Spark values={d.form.map((v, i) => Math.round(d.price * 0.6 + i * d.price * 0.025 + v))} label={`${d.name} price by round`} /> : <Spark values={d.form.slice(-8)} label={`${d.name} points by round`} />}</td>
          </Tr>
        ))}</tbody>
      </table></div>
    );
  } else if (!has.ownership) {
    body = <Empty>{NOT_PUBLISHED.ownership} It needs the lineups of every team in your league, which the worker does not collect yet.</Empty>;
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
        <span className="mut">{has.league ? `League: ${p.league.name} · ${p.league.size} teams. Shown only for leagues you belong to.` : 'Shown only for leagues you belong to.'}</span>
      </>
    );
  }
  return <LockedPage feature="market" title="Market"><div className="page"><Tile span="c12" label="Market" right={<Tabs value={ui.mktTab} options={['PRICE MODEL', 'VALUE', 'OWNERSHIP'] as const} onChange={(v) => set('mktTab', v)} label="Market views" />}>{body}</Tile></div></LockedPage>;
}
