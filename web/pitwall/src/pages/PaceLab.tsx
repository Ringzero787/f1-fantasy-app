import { entity } from '../data/logic';
import { NOT_PUBLISHED } from '../data/coverage';
import { useStore } from '../state';
import { AsTable, Empty, Pill, Tabs, TeamBar, Tile, Tr } from '../ui/bits';

/**
 * The pace lab (F-072 first cut). Every frame is built from the classifications the app keeps:
 * where each driver started and finished. That is a fact, not a lap time, so the page is FREE for
 * every signed-in reader (ADR-001). Long runs and pit stops need session timing, which is not
 * licensed; those tabs say so rather than drawing a shape from the row order.
 */
export function PaceLab() {
  const { payload: p, has, ui, set, open } = useStore();
  const rows = p.pace.map((r) => ({ r, e: entity(p, r.id) })).filter((x): x is { r: typeof x.r; e: NonNullable<typeof x.e> } => !!x.e);
  let body;
  if (!has.pace) {
    body = <Empty>{NOT_PUBLISHED.pace} Where each driver starts and finishes appears once a race of the season has been classified.</Empty>;
  } else if (ui.paceTab === 'QUALI VS RACE') {
    const w = 760, h = 320, maxP = 22;
    const X = (v: number) => 60 + ((v - 1) / (maxP - 1)) * (w - 100), Y = (v: number) => 30 + ((v - 1) / (maxP - 1)) * (h - 70);
    body = (
      <>
        <div className="scroll"><svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 560 }} role="img" aria-label="Average grid slot against average finish">
          <line x1={X(1)} y1={Y(1)} x2={X(maxP)} y2={Y(maxP)} stroke="var(--borderL)" strokeDasharray="4 4" />
          <text x="66" y="22">FINISHES AHEAD OF WHERE IT STARTS ↑</text><text x={w - 44} y={h - 46} textAnchor="end">LOSES PLACES ON SUNDAY ↓</text>
          <text x={w / 2} y={h - 8} textAnchor="middle">AVERAGE GRID SLOT</text>
          <text x="14" y={h / 2} textAnchor="middle" transform={`rotate(-90 14 ${h / 2})`}>AVERAGE FINISH</text>
          {rows.map(({ r, e }) => { const me = ui.lineup.drivers.includes(r.id); return (
            <g key={r.id} className="click" onClick={() => open(r.id)} data-tip={`${e.name}${me ? ' · in your lineup' : ''}\nStarts P${r.avgGrid} · finishes P${r.avgFinish} · ${r.gained >= 0 ? '+' : ''}${r.gained} places · ${r.starts} starts`}>
              <circle cx={X(r.avgGrid)} cy={Y(r.avgFinish)} r="12" fill="transparent" />
              {/* your drivers are red AND larger AND labelled: colour is never the only cue */}
              <circle cx={X(r.avgGrid)} cy={Y(r.avgFinish)} r={me ? 7 : 5} fill={me ? 'var(--red)' : 'var(--fg2)'} stroke="var(--card)" strokeWidth="2" />
              {me ? <text x={X(r.avgGrid) + 10} y={Y(r.avgFinish) + 3} style={{ fill: 'var(--fg)' }}>{e.name.slice(0, 3).toUpperCase()}</text> : null}
            </g>
          ); })}
        </svg></div>
        <span className="mut">Average grid slot against average finish this season, classified finishes only. Above the line gains places on Sunday, which Undercut scoring rewards. Larger labelled marks are in your lineup.</span>
        <AsTable caption="Average grid and finish per driver" head={['Driver', 'Starts', 'Avg grid', 'Avg finish', 'Places gained', 'In your lineup']} rows={rows.map(({ r, e }) => [e.name, r.starts, r.avgGrid, r.avgFinish, r.gained, ui.lineup.drivers.includes(r.id) ? 'yes' : 'no'])} />
      </>
    );
  } else if (ui.paceTab === 'STARTS') {
    body = (
      <>
        <div className="scroll"><table>
          <thead><tr><th scope="col">Driver</th><th scope="col">Starts</th><th scope="col">Avg grid</th><th scope="col">Avg finish</th><th scope="col">Places gained</th><th scope="col">Finished</th><th scope="col">Retired</th></tr></thead>
          <tbody>{rows.map(({ r, e }) => (
            <Tr key={r.id} onClick={() => open(r.id)} me={ui.lineup.drivers.includes(r.id)} focus={ui.focus === r.id} label={`${e.name} starts and finishes`}>
              <td><TeamBar p={p} team={e.team} /><b>{e.name}</b></td><td>{r.starts}</td><td>P{r.avgGrid}</td><td>P{r.avgFinish}</td>
              <td className={r.gained > 0 ? 'pos' : r.gained < 0 ? 'red' : 'mut'}>{r.gained > 0 ? `+${r.gained}` : r.gained}</td><td>{r.finishRate}%</td><td className={r.dnfs ? 'red' : 'mut'}>{r.dnfs}</td>
            </Tr>
          ))}</tbody>
        </table></div>
        <span className="mut">From this season's classifications. A retirement counts as a start but not a finish.</span>
      </>
    );
  } else {
    body = <Empty>Long-run pace, degradation and pit stop times need session timing, which Pit Wall does not license. What it does have is above: where every driver starts and finishes.</Empty>;
  }
  return (
    <div className="page">
      <Tile span="c12" label="Pace lab" right={<div className="th"><Pill>Free for everyone</Pill>{has.pace ? <Tabs value={ui.paceTab} options={['QUALI VS RACE', 'STARTS', 'LONG RUN'] as const} onChange={(v) => set('paceTab', v)} label="Pace views" /> : null}</div>}>
        {body}
      </Tile>
    </div>
  );
}
