import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { money } from '../data/logic';
import type { Entity, Payload } from '../data/types';

export const Lbl = ({ children }: { children: ReactNode }) => <span className="lbl">{children}</span>;

export function Tile({ span, variant, label, right, children }: { span?: string; variant?: 'open' | 'you'; label: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={`tile ${span ?? ''} ${variant ?? ''}`}>
      <div className="th"><Lbl>{label}</Lbl>{right}</div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({ value, options, onChange, small = true, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; small?: boolean; label: string }) {
  return (
    <div className={`tabs ${small ? 'sm' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => <button key={o} type="button" role="tab" aria-selected={value === o} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}

export const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) => (
  <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>
);
export const Pill = ({ red, children }: { red?: boolean; children: ReactNode }) => <span className={`pill ${red ? 'r' : ''}`}>{children}</span>;

/**
 * A frame with nothing to show yet. Says so in a sentence rather than rendering an empty table or,
 * worse, a row of zeros that reads as a measurement.
 */
export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="mut" style={{ margin: '18px 0', fontFamily: 'var(--disp)', fontSize: 13, lineHeight: 1.6 }} role="status">{children}</p>
);

/** Team colour as a small bar only (Grid rule); the team name is always nearby as text. */
export const TeamBar = ({ p, team }: { p: Payload; team: string }) => <span className="tbar" style={{ background: p.teams[team]?.color ?? 'var(--borderS)' }} aria-hidden="true" />;

/** Direction is carried by the glyph and the sign, never by colour alone. */
export function Arrow({ n }: { n: number }) {
  if (n > 0) return <span className="pos">▲ {n}</span>;
  if (n < 0) return <span className="red">▼ {-n}</span>;
  return <span className="mut">• 0</span>;
}

export function Range({ e, max = 80 }: { e: Pick<Entity, 'floor' | 'med' | 'ceil'>; max?: number }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <span className="range" role="img" aria-label={`Floor ${e.floor}, median ${e.med}, ceiling ${e.ceil}`} data-tip={`Floor ${e.floor} · median ${e.med} · ceiling ${e.ceil}\n15th to 85th percentile of the simulation`}>
      <i style={{ left: pct(e.floor), width: pct(e.ceil - e.floor) }} /><b style={{ left: pct(e.med) }} />
    </span>
  );
}

export function Spark({ values, w = 84, h = 22, label }: { values: number[]; w?: number; h?: number; label: string }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - (v / mx) * (h - 6)]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(', ')}`} data-tip={`${label}\n${values.join(' · ')}`}>
      <polyline points={pts.map((x) => x.join(',')).join(' ')} fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--fg)" />
    </svg>
  );
}

export const FitCell = ({ v, label }: { v: number; label: string }) => (
  <span className="cell" style={{ background: `color-mix(in srgb,var(--fg) ${v * 17}%,transparent)`, color: v >= 4 ? 'var(--inv)' : 'var(--fg)' }} data-tip={`${label}: circuit fit ${v}/5`}>{v}</span>
);

export const Meter = ({ pct, red, style }: { pct: number; red?: boolean; style?: CSSProperties }) => (
  <span className={`meter ${red ? 'r' : ''}`} style={style} aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>
);

const onKey = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } };

/** A clickable row: real button semantics for keyboard and screen readers. */
export function Row({ cols, onClick, selected, pad, two, tip, label, children }: { cols?: string; onClick?: () => void; selected?: boolean; pad?: boolean; two?: boolean; tip?: string; label?: string; children: ReactNode }) {
  const cls = `row ${onClick ? 'click' : ''} ${selected ? 'sel' : ''} ${pad ? 'pad' : ''} ${two ? 'two' : ''}`;
  const style = cols ? { gridTemplateColumns: cols } : undefined;
  if (!onClick) return <div className={cls} style={style} data-tip={tip}>{children}</div>;
  return <div className={cls} style={style} role="button" tabIndex={0} aria-pressed={selected} aria-label={label} data-tip={tip} onClick={onClick} onKeyDown={onKey(onClick)}>{children}</div>;
}

/** A clickable table row. */
export function Tr({ onClick, me, focus, label, children }: { onClick: () => void; me?: boolean; focus?: boolean; label: string; children: ReactNode }) {
  return <tr className={`click ${me ? 'me' : ''} ${focus ? 'sel' : ''}`} tabIndex={0} aria-label={label} onClick={onClick} onKeyDown={onKey(onClick)}>{children}</tr>;
}

export const Money = ({ n }: { n: number }) => <span className="num">{money(n)}</span>;

/** Every chart offers the same numbers as a table (F-075: colour and shape are never the only encoding). */
export function AsTable({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <details className="tbl">
      <summary>Show as table</summary>
      <div className="scroll"><table><caption className="visually-hidden">{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    </details>
  );
}

/** One tooltip for the whole app, driven by `data-tip`; follows the pointer and keyboard focus. */
export function Tooltip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('[data-tip]') : null);
    const move = (e: MouseEvent) => { const el = find(e.target); setTip(el?.dataset.tip ? { text: el.dataset.tip, x: Math.min(e.clientX + 12, window.innerWidth - 250), y: e.clientY + 14 } : null); };
    const focus = (e: FocusEvent) => { const el = find(e.target); if (!el?.dataset.tip) { setTip(null); return; } const r = el.getBoundingClientRect(); setTip({ text: el.dataset.tip, x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 6 }); };
    const blur = () => setTip(null);
    document.addEventListener('mousemove', move); document.addEventListener('focusin', focus); document.addEventListener('focusout', blur);
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur); };
  }, []);
  if (!tip) return null;
  return <div id="tip" ref={ref} role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}
