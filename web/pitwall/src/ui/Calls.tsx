import { useEffect, useState } from 'react';
import { confidenceOf } from '../data/confidence';
import { entity, type Rec } from '../data/logic';
import { useStore } from '../state';
import { Compare } from './Compare';
import { Pill, Range, TeamBar } from './bits';

/**
 * The calls strip (F-097 stage 3): one compact tile per recommendation from `briefRecs`, so the
 * swaps show while the lineup is open and the ace, hold, risk and team calls when it is locked.
 *
 * Desktop: hover or focus a tile that has a comparison to peek at it in a callout under the tile;
 * click to lock it (accent border, lock mark) with Expand and close; Expand puts the full
 * comparison in flow under the strip; Collapse goes back to the locked callout; the locked tile
 * again, close, or Escape unlocks. A tile whose two sides are the same pick only locks.
 *
 * Phone (no hover): a tap opens the comparison in the slide-over, as before, so the page never
 * grows under a floating panel it cannot fit.
 *
 * Nothing is locked at rest: the page opens readable, with no callout over the wire.
 */
export function Calls({ recs }: { recs: Rec[] }) {
  const { payload: p, ui, set } = useStore();
  const [hover, setHover] = useState<number | null>(null);
  const [hoverable, setHoverable] = useState(true);
  const pinned = ui.rec;
  const expanded = ui.recExpanded && pinned >= 0 && pinned < recs.length;
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (min-width: 981px)');
    const sync = () => setHoverable(mq.matches);
    sync(); mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const comparable = (r: Rec) => r.a !== r.b;
  const unlock = () => { set('rec', -1); set('recExpanded', false); };
  const pin = (i: number) => {
    if (!hoverable) { set('rec', i); set('recOver', i); return; }
    if (pinned === i) unlock(); else { set('rec', i); set('recExpanded', false); }
  };
  // Escape unlocks from anywhere on the page: the button that had focus unmounts with the callout,
  // so a listener on the strip itself would miss the key. The slide-over owns Escape while it is open.
  useEffect(() => {
    if (pinned < 0 || ui.over !== null) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') unlock(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  // the short line under the title: both projections for a comparison, and how wide the
  // incoming pick's band is (F-096), so the tile says what the call rests on
  const note = (r: Rec) => {
    const a = entity(p, r.a), b = entity(p, r.b);
    if (!a || !b) return r.tag;
    if (!comparable(r)) return `${a.name} projects ${a.med}`;
    const c = confidenceOf(b);
    return `${a.name} ${a.med} vs ${b.name} ${b.med}${c.published ? ` · ${c.rangeLabel} range` : ''}`;
  };
  return (
    <section className="calls c12" aria-label="The calls">
      <div className="th">
        <h2 className="h2 calls-h">The calls</h2>
        <span className="lbl only-wide">{hoverable ? 'Hover to peek · click to lock · expand for all stats' : 'Tap a call to compare'}</span>
      </div>
      <div className="calls-grid">
        {recs.map((r, i) => {
          const locked = pinned === i;
          // no peek while any call is locked: a second callout over the locked one, or over the
          // expanded panel, is two things open at once
          const peek = hoverable && hover === i && pinned < 0;
          const showCard = hoverable && comparable(r) && ((locked && !expanded) || peek);
          const a = entity(p, r.a), b = entity(p, r.b);
          return (
            <div key={`${r.kind}-${r.a}-${r.b}`} className="callw" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <button type="button" className={`call ${r.kind === 'ACE' ? 'ace' : ''} ${r.bad ? 'risk' : ''}`} aria-pressed={locked} aria-expanded={locked && expanded}
                onClick={() => pin(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${r.kind}: ${r.title}, ${r.tag}`}>
                <span className="call-top">
                  <Pill red={r.bad || r.kind === 'ACE'}>{r.kind}</Pill>
                  <span className="call-title">{r.title}</span>
                  <span className={`call-meta num ${r.good ? 'pos' : r.bad ? 'red' : 'fg2'}`}>{r.tag}</span>
                  {locked ? <span className="call-lock red" aria-hidden="true">🔒</span> : null}
                </span>
                <span className="call-note">{note(r)}</span>
              </button>
              {showCard && a && b ? (
                <div className={`peek ${i >= Math.ceil(recs.length / 2) ? 'right' : 'left'}`} role="dialog" aria-label={`${a.name} against ${b.name}`}>
                  <div className="th">
                    {locked ? (
                      <>
                        <span className="lbl red">🔒 Locked</span>
                        <span className="srow">
                          <button type="button" className="cta sm" onClick={() => set('recExpanded', true)}>Expand</button>
                          <button type="button" className="ghost" aria-label="Unlock and close" onClick={unlock}>✕</button>
                        </span>
                      </>
                    ) : <span className="lbl">Peek · click the tile to lock</span>}
                  </div>
                  <div className="peek-names">
                    <span className="name"><TeamBar p={p} team={a.team} />{a.name}</span>
                    <span className="lbl">vs</span>
                    <span className="name mut">{b.name}<TeamBar p={p} team={b.team} /></span>
                  </div>
                  <div className="peek-cells">
                    <div className="cell3"><span className="lbl">Proj</span><span className="num"><b className="peek-big">{a.med}</b> <span className="mut">/ {b.med}</span></span>
                      <span className={`peek-sub ${a.med >= b.med ? 'pos' : 'red'}`}>{a.med >= b.med ? '+' : ''}{a.med - b.med}{r.kind === 'ACE' ? ` · 2× = ${a.med * 2}` : ''}</span></div>
                    <div className="cell3"><span className="lbl">Range</span><Range e={a} /><Range e={b} /><span className="peek-sub fg2">{a.floor}–{a.ceil} <span className="mut">/ {b.floor}–{b.ceil}</span></span></div>
                    <div className="cell3"><span className="lbl">DNF risk</span><span className="num"><b className="peek-big">{(a as { dnf?: number }).dnf ?? '—'}{typeof (a as { dnf?: number }).dnf === 'number' ? '%' : ''}</b> <span className="mut">/ {(b as { dnf?: number }).dnf ?? '—'}{typeof (b as { dnf?: number }).dnf === 'number' ? '%' : ''}</span></span></div>
                  </div>
                  <p className="peek-why">{r.why}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {/* F-096: the ordering is a lean from our published band, said next to the calls it orders */}
      <p className="mut calls-note">Swaps come first, ordered by projected gain discounted for how wide the incoming pick's range is; then one ace, value, risk and team call. The discount is a lean from the published floor-to-ceiling band, not a calibrated model.</p>
      {expanded && recs[pinned] && comparable(recs[pinned]) ? (
        <div className="callx">
          <div className="th">
            <span className="lbl red">🔒 Locked · {recs[pinned].title}</span>
            <span className="srow">
              <button type="button" className="ghost" onClick={() => set('recExpanded', false)}>Collapse</button>
              <button type="button" className="ghost" aria-label="Unlock and close" onClick={unlock}>✕</button>
            </span>
          </div>
          <Compare rec={recs[pinned]} />
        </div>
      ) : null}
    </section>
  );
}
