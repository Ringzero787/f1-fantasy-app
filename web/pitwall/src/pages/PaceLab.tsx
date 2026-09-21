import { useStore } from '../state';
import { AsTable, Meter, Pill, Tabs, TeamBar, Tile, Tr } from '../ui/bits';

// Every frame on this page is timing-derived, so it is part of the FREE look and never sits behind the pass (ADR-001).
export function PaceLab() {
  const { payload: p, ui, set, open } = useStore();
  let body;
  if (ui.paceTab === 'LONG RUN') {
    const top = [...p.drivers].sort((a, b) => a.r - b.r).slice(0, 12);
    body = (
      <>
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th><th scope="col">Compound</th><th scope="col">Laps</th><th scope="col">Gap to best · s/lap</th><th scope="col">Deg · s/lap²</th></tr></thead>
          <tbody>{top.map((d) => (
            <Tr key={d.id} onClick={() => open(d.id)} focus={ui.focus === d.id} label={`${d.name} long run`}>
              <td><TeamBar p={p} team={d.team} /><b>{d.name}</b></td><td>{d.num % 2 ? 'MEDIUM' : 'HARD'}</td><td>{9 + (d.num % 7)}</td>
              <td><Meter pct={(d.r / 1.2) * 100} style={{ display: 'inline-block', width: 120, verticalAlign: 'middle' }} /> +{d.r.toFixed(2)}</td><td>{(0.03 + d.q / 20).toFixed(3)}</td>
            </Tr>
          ))}</tbody>
        </table></div>
        <span className="mut">Practice race simulations, fuel-corrected (example values).</span>
      </>
    );
  } else if (ui.paceTab === 'QUALI VS RACE') {
    const w = 760, h = 300, X = (v: number) => 60 + (v / 1.2) * (w - 100), Y = (v: number) => h - 40 - (v / 1.2) * (h - 70);
    body = (
      <>
        <div className="scroll"><svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 560 }} role="img" aria-label="Qualifying gap against race pace gap">
          <line x1={X(0.6)} x2={X(0.6)} y1="30" y2={h - 40} stroke="var(--borderL)" /><line x1="60" x2={w - 40} y1={Y(0.6)} y2={Y(0.6)} stroke="var(--borderL)" />
          <text x="66" y="24">QUALIFIES WELL · RACES SLOW</text><text x={w - 44} y={h - 46} textAnchor="end">QUALIFIES SLOW · RACES WELL → POSITIONS GAINED</text>
          <text x={w / 2} y={h - 8} textAnchor="middle">QUALI GAP TO POLE (S)</text>
          {p.drivers.map((d) => { const me = ui.lineup.drivers.includes(d.id); return (
            <g key={d.id} className="click" onClick={() => open(d.id)} data-tip={`${d.name}${me ? ' · in your lineup' : ''}\nQuali +${d.q}s · race +${d.r}s/lap`}>
              <circle cx={X(d.q)} cy={Y(d.r)} r="12" fill="transparent" />
              {/* your drivers are red AND larger AND labelled: colour is never the only cue */}
              <circle cx={X(d.q)} cy={Y(d.r)} r={me ? 7 : 5} fill={me ? 'var(--red)' : 'var(--fg2)'} stroke="var(--card)" strokeWidth="2" />
              {me ? <text x={X(d.q) + 10} y={Y(d.r) + 3} style={{ fill: 'var(--fg)' }}>{d.id}</text> : null}
            </g>
          ); })}
        </svg></div>
        <span className="mut">Larger labelled marks are in your lineup. Bottom-right cars gain places on Sunday, which Undercut scoring rewards.</span>
        <AsTable caption="Qualifying gap and race pace gap per driver" head={['Driver', 'Quali gap (s)', 'Race gap (s/lap)', 'In your lineup']} rows={p.drivers.map((d) => [d.name, d.q, d.r, ui.lineup.drivers.includes(d.id) ? 'yes' : 'no'])} />
      </>
    );
  } else {
    body = (
      <div className="scroll"><table>
        <thead><tr><th scope="col">Team</th><th scope="col">Median stop</th><th scope="col">Best</th><th scope="col">Stops under 2.5s</th><th scope="col">Slow-stop rate</th></tr></thead>
        <tbody>{p.constructors.map((c, i) => (
          <Tr key={c.id} onClick={() => open(c.id)} focus={ui.focus === c.id} label={`${c.name} pit stops`}>
            <td><TeamBar p={p} team={c.id} /><b>{c.name}</b></td><td>{(2.2 + i * 0.09).toFixed(2)}s</td><td>{(1.9 + i * 0.05).toFixed(2)}s</td><td>{82 - i * 6}%</td><td>{3 + i}%</td>
          </Tr>
        ))}</tbody>
      </table></div>
    );
  }
  return (
    <div className="page">
      <Tile span="c12" label="Pace lab" right={<div className="th"><Pill>Free for everyone</Pill><Tabs value={ui.paceTab} options={['LONG RUN', 'QUALI VS RACE', 'PIT STOPS'] as const} onChange={(v) => set('paceTab', v)} label="Pace views" /></div>}>
        {body}
      </Tile>
    </div>
  );
}
