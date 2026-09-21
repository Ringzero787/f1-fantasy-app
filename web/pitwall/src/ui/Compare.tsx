import { compareRows, entity, type Rec } from '../data/logic';
import { isCtor } from '../data/types';
import { useStore } from '../state';
import { Lbl, Pill, Range, TeamBar } from './bits';

/** Side-by-side comparison of the user's pick and the recommended or nearest alternative. */
export function Compare({ rec }: { rec: Rec }) {
  const { payload: p, open, tryAct, setAce, ui } = useStore();
  const a = entity(p, rec.a), b = entity(p, rec.b);
  if (!a || !b) return null;
  const head = (e: NonNullable<typeof a>) => (
    <span><span className="name">{e.name}</span> <TeamBar p={p} team={e.team} /><span className="mut">{isCtor(e) ? 'TEAM' : `#${e.num}`}</span></span>
  );
  return (
    <div className="cmp">
      <div className="cmph"><span><Lbl>In your lineup</Lbl></span><Pill red={rec.bad}>{rec.kind}</Pill><span><Lbl>{rec.good ? 'Recommended' : 'Alternative'}</Lbl></span></div>
      <div className="cmph">{head(a)}<span className="mut">vs</span>{head(b)}</div>
      <div className="cmpr"><span><Range e={a} /></span><span className="mut">Range</span><span><Range e={b} /></span></div>
      {compareRows(p, rec.a, rec.b).map((r) => (
        <div className="cmpr num" key={r.label}>
          <span>{r.winner === 'a' ? <b className="win">{r.a} ◂</b> : <span className={r.winner ? 'lose' : ''}>{r.a}</span>}</span>
          <span className="mut">{r.label}</span>
          <span>{r.winner === 'b' ? <b className="win">▸ {r.b}</b> : <span className={r.winner ? 'lose' : ''}>{r.b}</span>}</span>
        </div>
      ))}
      <p style={{ margin: '6px 0 0', color: 'var(--fg2)' }}>{rec.why}</p>
      <div className="th" style={{ justifyContent: 'flex-start' }}>
        {rec.act && (rec.good || rec.bad) ? <button type="button" className={rec.good ? 'cta' : 'ghost'} onClick={() => tryAct(rec.act!)}>Try this swap in lineup lab →</button> : null}
        {rec.ace ? <button type="button" className="cta" onClick={() => setAce(rec.ace!)} disabled={ui.lineup.ace === rec.ace}>{ui.lineup.ace === rec.ace ? `Ace is on ${entity(p, rec.ace)?.name}` : `Set ace on ${entity(p, rec.ace)?.name}`}</button> : null}
        {!rec.good && !rec.bad ? <Pill>No change needed</Pill> : null}
        <button type="button" className="ghost" onClick={() => open(a.id)}>{a.name} detail</button>
        <button type="button" className="ghost" onClick={() => open(b.id)}>{b.name} detail</button>
      </div>
    </div>
  );
}
