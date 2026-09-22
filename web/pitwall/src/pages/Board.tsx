import { entity, money } from '../data/logic';
import type { Driver } from '../data/types';
import { useStore } from '../state';
import { Arrow, AsTable, Chip, Range, Spark, Tabs, TeamBar, Tile, Tr } from '../ui/bits';

const COLS: Record<string, Array<keyof Driver>> = { VALUE: ['price', 'val', 'pm', 'cons'], PACE: ['q', 'r', 'win', 'pod'], OWNERSHIP: ['own', 'lev', 'price', 'val'], RISK: ['dnf', 'floor', 'ceil', 'cons'] };
const HEAD: Record<string, string> = { price: 'Price', val: 'Pts/$100', pm: '+/−', cons: 'Cons %', q: 'Quali gap', r: 'Race gap', win: 'Win %', pod: 'Podium %', own: 'Own %', lev: 'Leverage', dnf: 'DNF %', floor: 'Floor', ceil: 'Ceiling', med: 'Proj' };
const SESSIONS = ['THU', 'FP1', 'FP2', 'FP3', 'QUALI'];

export function Board() {
  const { payload: p, ui, set, open } = useStore();
  const cols = COLS[ui.preset];
  const key = ui.sort as keyof Driver;
  const rows = [...p.drivers].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)).map((d, i) => ({ ...d, lev: Math.round(d.own / 5 - i) }));
  const sortBtn = (k: string) => (
    <th key={k} scope="col" aria-sort={ui.sort === k ? 'descending' : undefined}><button type="button" onClick={() => set('sort', k)}>{HEAD[k]}{ui.sort === k ? ' ▾' : ''}</button></th>
  );

  let body;
  if (ui.boardTab === 'PROJECTIONS') {
    body = (
      <div className="scroll"><table>
        <thead><tr><th scope="col">Driver</th><th scope="col">Floor · median · ceiling</th>{sortBtn('med')}{cols.map((c) => sortBtn(String(c)))}<th scope="col">Next $</th><th scope="col">Form</th></tr></thead>
        <tbody>{rows.map((d) => (
          <Tr key={d.id} onClick={() => open(d.id)} me={ui.lineup.drivers.includes(d.id)} focus={ui.focus === d.id} label={`${d.name}, projection ${d.med}`}>
            <td><TeamBar p={p} team={d.team} /><b>{d.name}</b> <span className="mut">{d.num}</span></td><td><Range e={d} /></td><td><b>{d.med}</b></td>
            {cols.map((c) => <td key={String(c)}>{c === 'price' ? money(d.price) : String(d[c] ?? '—')}</td>)}
            <td><Arrow n={d.dprice} /></td><td><Spark values={d.form.slice(-8)} label={`${d.name}, last 8 rounds`} /></td>
          </Tr>
        ))}</tbody>
      </table></div>
    );
  } else if (ui.boardTab === 'PROBABILITIES') {
    body = (
      <>
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th><th scope="col">Win</th><th scope="col">Podium</th><th scope="col">Top 10</th><th scope="col">DNF</th></tr></thead>
          <tbody>{rows.slice(0, 14).map((d) => (
            <Tr key={d.id} onClick={() => open(d.id)} focus={ui.focus === d.id} label={`${d.name} probabilities`}>
              <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td>
              {[d.win, d.pod, d.t10, d.dnf].map((v, i) => <td key={i}><span className="cell" style={{ minWidth: 52, background: `color-mix(in srgb,var(--fg) ${Math.min(90, v)}%,transparent)`, color: v > 50 ? 'var(--inv)' : 'var(--fg)' }}>{v}%</span></td>)}
            </Tr>
          ))}</tbody>
        </table></div>
        <span className="mut">Model probabilities from the race simulation. Not bookmaker odds.</span>
      </>
    );
  } else {
    const pick = entity(p, ui.focus ?? '') && p.drivers.some((d) => d.id === ui.focus) ? ui.focus! : rows[0].id;
    const w = 760, h = 240;
    const pts = (d: Driver) => SESSIONS.map((_, i) => [50 + (i * (w - 90)) / 4, h - 30 - (d.med + (i ? Math.sin(d.num + i) * 5 : 0)) * 2.6]);
    const shown = [...rows.slice(0, 8).filter((d) => d.id !== pick), rows.find((d) => d.id === pick)!];
    body = (
      <>
        <div className="scroll"><svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 560 }} role="img" aria-label="Projection movement across the weekend">
          {[20, 40, 60].map((v) => <g key={v}><line x1="50" x2={w - 40} y1={h - 30 - v * 2.6} y2={h - 30 - v * 2.6} stroke="var(--borderL)" /><text x="18" y={h - 27 - v * 2.6}>{v}</text></g>)}
          {SESSIONS.map((s, i) => <text key={s} x={50 + (i * (w - 90)) / 4} y={h - 8} textAnchor="middle">{s}</text>)}
          {shown.map((d) => { const P = pts(d), red = d.id === pick; return (
            <g key={d.id} className="click" onClick={() => open(d.id)} data-tip={`${d.name}\n${SESSIONS.map((s, i) => `${s} ${Math.round((h - 30 - P[i][1]) / 2.6)}`).join(' · ')}`}>
              <polyline points={P.map((x) => x.join(',')).join(' ')} fill="none" stroke={red ? 'var(--red)' : 'var(--borderS)'} strokeWidth={red ? 3 : 2} strokeDasharray={red ? undefined : '0'} />
              {red ? <text x={P[4][0] + 6} y={P[4][1] + 3} style={{ fill: 'var(--fg)' }}>{d.name}</text> : null}
            </g>
          ); })}
        </svg></div>
        <span className="mut">Projected points after each session (example shape). Click any driver to make them the highlighted line.</span>
        <AsTable caption="Projected points after each session" head={['Driver', ...SESSIONS]} rows={shown.map((d) => [d.name, ...pts(d).map((x) => Math.round((h - 30 - x[1]) / 2.6))])} />
      </>
    );
  }
  return (
    <div className="page">
      <Tile span="c12" label={`Projection board · RD ${p.round.number}`} right={
        <div className="th">
          <Tabs value={ui.boardTab} options={['PROJECTIONS', 'PROBABILITIES', 'MOVEMENT'] as const} onChange={(v) => set('boardTab', v)} label="Board views" />
          {ui.boardTab === 'PROJECTIONS' ? (['VALUE', 'PACE', 'OWNERSHIP', 'RISK'] as const).map((x) => <Chip key={x} on={ui.preset === x} onClick={() => set('preset', x)}>{x}</Chip>) : null}
        </div>}>
        {body}
      </Tile>
    </div>
  );
}
