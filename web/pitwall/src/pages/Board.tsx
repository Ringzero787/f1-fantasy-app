import { entity, money } from '../data/logic';
import type { Driver } from '../data/types';
import { useStore } from '../state';
import { Empty, Arrow, AsTable, Chip, Range, Spark, Tabs, TeamBar, Tile, Tr } from '../ui/bits';
import { Locked } from '../ui/Locked';
import { can } from '../data/access';

const COLS: Record<string, Array<keyof Driver>> = { VALUE: ['price', 'val', 'pm', 'cons'], PACE: ['q', 'r', 'win', 'pod'], OWNERSHIP: ['own', 'lev', 'price', 'val'], RISK: ['dnf', 'floor', 'ceil', 'cons'] };
const HEAD: Record<string, string> = { price: 'Price', val: 'Pts/$100', pm: '+/−', cons: 'Cons %', q: 'Quali gap', r: 'Race gap', win: 'Win %', pod: 'Podium %', own: 'Own %', lev: 'Leverage', dnf: 'DNF %', floor: 'Floor', ceil: 'Ceiling', med: 'Proj' };
const SESSIONS = ['THU', 'FP1', 'FP2', 'FP3', 'QUALI'];

export function Board() {
  const { payload: p, has, ui, set, open, pass } = useStore();
  // Free: every driver, median only. The extra columns, presets and the other tabs need the pass.
  const full = can(pass, 'board.full');
  // A preset whose columns are not published would show a column of zeros, so it is not offered.
  const presets = (['VALUE', 'PACE', 'OWNERSHIP', 'RISK'] as const).filter((k) => (k === 'PACE' ? has.timing : k === 'OWNERSHIP' ? has.ownership : true));
  const preset = presets.includes(ui.preset) ? ui.preset : 'VALUE';
  const cols = COLS[preset];
  const key = ui.sort as keyof Driver;
  // Leverage is ownership against rank: without ownership it collapses to the row index, which
  // would read as analysis, so it is left undefined and the cell shows a dash.
  const all = [...p.drivers].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)).map((d, i) => (has.ownership ? { ...d, lev: Math.round(d.own / 5 - i) } : d));
  // Every driver's projection is free; the pass buys the columns beside it — ranges, value, form,
  // the price model and the probabilities. Slicing the grid to ten hid picks people actually hold.
  const rows = all;
  const sortBtn = (k: string) => (
    <th key={k} scope="col" aria-sort={ui.sort === k ? 'descending' : undefined}><button type="button" onClick={() => set('sort', k)}>{HEAD[k]}{ui.sort === k ? ' ▾' : ''}</button></th>
  );

  let body;
  if (ui.boardTab === 'PROJECTIONS') {
    body = (
      <div className="scroll"><table>
        {/* Free look: every driver and their median. Ranges, value, form and price movement are the pass. */}
        <thead><tr><th scope="col">Driver</th>{full ? <th scope="col">Floor · median · ceiling</th> : null}{sortBtn('med')}{full ? cols.map((c) => sortBtn(String(c))) : null}{full ? <><th scope="col">Next $</th><th scope="col">Form</th></> : null}</tr></thead>
        <tbody>{rows.map((d) => (
          <Tr key={d.id} onClick={() => open(d.id)} me={ui.lineup.drivers.includes(d.id)} focus={ui.focus === d.id} label={`${d.name}, projection ${d.med}`}>
            <td><TeamBar p={p} team={d.team} /><b>{d.name}</b> <span className="mut">{d.num}</span></td>
            {full ? <td><Range e={d} /></td> : null}
            <td><b>{d.med}</b></td>
            {full ? cols.map((c) => <td key={String(c)}>{c === 'price' ? money(d.price) : String(d[c] ?? '—')}</td>) : null}
            {full ? <><td><Arrow n={d.dprice} /></td><td><Spark values={d.form.slice(-8)} label={`${d.name}, last 8 rounds`} /></td></> : null}
          </Tr>
        ))}</tbody>
      </table></div>
    );
  } else if (ui.boardTab === 'PROBABILITIES') {
    body = (
      <Locked feature="board.probabilities">
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
      </Locked>
    );
  } else {
    const pick = entity(p, ui.focus ?? '') && p.drivers.some((d) => d.id === ui.focus) ? ui.focus! : rows[0].id;
    const w = 760, h = 240;
    const pts = (d: Driver) => SESSIONS.map((_, i) => [50 + (i * (w - 90)) / 4, h - 30 - (d.med + (i ? Math.sin(d.num + i) * 5 : 0)) * 2.6]);
    const shown = [...rows.slice(0, 8).filter((d) => d.id !== pick), rows.find((d) => d.id === pick)!];
    body = (
      <Locked feature="board.movement">
        {/* The line is drawn from a sine wave, not from the per-session snapshots the worker
            publishes to pw_projections, which nothing reads yet. A made-up trend under a
            "movement" heading is worse than no chart at all. */}
        {!has.mock ? <Empty>Projection movement is not published yet. It needs the per-session snapshots from across the weekend.</Empty> : <>
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
        </>}
      </Locked>
    );
  }
  return (
    <div className="page">
      <Tile span="c12" label={`Projection board · RD ${p.round.number}`} right={
        <div className="th">
          <Tabs value={ui.boardTab} options={['PROJECTIONS', 'PROBABILITIES', 'MOVEMENT'] as const} onChange={(v) => set('boardTab', v)} label="Board views" />
          {ui.boardTab === 'PROJECTIONS' && full ? presets.map((x) => <Chip key={x} on={preset === x} onClick={() => set('preset', x)}>{x}</Chip>) : null}
        </div>}>
        {body}
        {full || ui.boardTab !== 'PROJECTIONS' ? null : (
          <Locked feature="board.full"><div className="mut" style={{ padding: '10px 0' }}>Ranges, value, form, the price model and the chance of a win, a podium or a retirement.</div></Locked>
        )}
      </Tile>
    </div>
  );
}
