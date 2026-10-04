import { applySwap, compareRows, entity, money, type Rec } from '../data/logic';
import { aceFrozen, CONTRACT_LENGTH, planSave } from '../data/team';
import { isCtor } from '../data/types';
import { useStore } from '../state';
import { Lbl, Pill, Range, TeamBar } from './bits';

/**
 * The one thing a recommendation asks the reader to do, as a button: make the swap (a what-if
 * carried into the Lineup Lab, where it is saved), set the ace (written at once), or nothing,
 * said plainly. Shared by the locked callout on the calls strip and the full comparison, so the
 * action is never further away than the stats.
 */
export function RecAction({ rec, size = 'md' }: { rec: Rec; size?: 'md' | 'lg' }) {
  const { payload: p, tryAct, setAce, commitAct, ui, real, saving } = useStore();
  const cls = size === 'lg' ? 'cta lg' : 'cta';
  if (rec.act && (rec.good || rec.bad)) {
    // A locked weekend cannot take the swap; the Lab shows it as a what-if until the team unlocks.
    if (real?.team.isLocked) return <button type="button" className="ghost" onClick={() => tryAct(rec.act!)}>Team locked · preview in the Lab →</button>;
    // The swap is written the moment it is clicked, so what it costs is said first: the sale, any
    // early-termination fee and the bank afterwards, from the same plan the Lab would confirm.
    const plan = real ? planSave(real.team, applySwap(ui.lineup, rec.act), real.market, CONTRACT_LENGTH, real.completedRaces) : null;
    const fees = plan ? plan.steps.reduce((s, x) => s + ('fee' in x ? x.fee : 0), 0) : 0;
    const label = saving ? 'Saving…' : rec.good ? 'Make this swap →' : 'Swap them out →';
    return (
      <span className="act">
        <button type="button" className={cls} disabled={!!saving || !!plan?.blocked} onClick={() => void commitAct(rec)}>{label}</button>
        <span className="act-cost mut">{plan?.blocked ? plan.blocked : plan ? `Saved to your team at once${fees > 0 ? ` · early termination ${money(fees)}` : ''} · bank after ${money(plan.bankAfter)} · undo afterwards` : 'Applied at once · undo afterwards'}</span>
      </span>
    );
  }
  if (rec.ace) {
    // The button says so rather than failing on the click. The recommendation itself
    // still stands — it is what to do when it opens. The gate is the race start, not
    // the qualifying lock: moving the ace after qualifying is the point of the ace
    // (F-095), and reading isLocked here shut the window a day early.
    const locked = real ? aceFrozen(real.team) : false;
    const isAce = ui.lineup.ace === rec.ace;
    const label = locked ? 'The race has started' : isAce ? `Ace is on ${entity(p, rec.ace)?.name}` : `Set ace on ${entity(p, rec.ace)?.name}`;
    return <button type="button" className={cls} onClick={() => setAce(rec.ace!)} disabled={isAce || locked}>{label}</button>;
  }
  return <Pill>No change needed</Pill>;
}

/** Side-by-side comparison of the user's pick and the recommended or nearest alternative. */
export function Compare({ rec }: { rec: Rec }) {
  const { payload: p, open } = useStore();
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
      {/* Two columns. Ten stacked rows made this panel taller than the recommendation list it sits
          beside, which never holds more than six — so the page scrolled for a comparison that fits
          in half the room. Nothing is shrunk or dropped; the same rows are laid out 2-up. */}
      <div className="cmpstats">
      {compareRows(p, rec.a, rec.b).map((r) => (
        <div className="cmpr num" key={r.label}>
          <span>{r.winner === 'a' ? <b className="win">{r.a} ◂</b> : <span className={r.winner ? 'lose' : ''}>{r.a}</span>}</span>
          <span className="mut">{r.label}</span>
          <span>{r.winner === 'b' ? <b className="win">▸ {r.b}</b> : <span className={r.winner ? 'lose' : ''}>{r.b}</span>}</span>
        </div>
      ))}
      </div>
      <p style={{ margin: '6px 0 0', color: 'var(--fg2)' }}>{rec.why}</p>
      <div className="th" style={{ justifyContent: 'flex-start' }}>
        <RecAction rec={rec} />
        <button type="button" className="ghost" onClick={() => open(a.id)}>{a.name} detail</button>
        <button type="button" className="ghost" onClick={() => open(b.id)}>{b.name} detail</button>
      </div>
    </div>
  );
}
