import { useEffect, useRef, useState } from 'react';
import { MoonshotPanel } from './Moonshot';
import { briefRecs, entity, money, percentileOf } from '../data/logic';
import { isCtor, type Driver, type Entity } from '../data/types';
import { useStore } from '../state';
import { Arrow, AsTable, Chip, Empty, FitCell, Lbl, Meter, Pill, Range, Row, Tabs, TeamBar } from './bits';
import { NOT_PUBLISHED } from '../data/coverage';
import { Compare } from './Compare';
import { loadOutlook, type Outlook as OutlookDoc } from '../lib/entityApi';
import { asOfLabel } from '../lib/lock';
import { SEASON } from '../lib/env';
import { ACE_MAX_PRICE } from '../data/team';

function Present({ d }: { d: Entity }) {
  const { payload: p, has, pass, ui, set } = useStore();
  const drv = isCtor(d) ? null : d;
  // A constructor has no published per-round series yet; the example set draws a curve for it.
  const hist = drv ? drv.form : has.mock ? Array.from({ length: 16 }, (_, i) => d.med + Math.round(Math.sin(i) * 12)) : [];
  const n = { L5: 5, L10: 10, SEASON: 16 }[ui.win];
  const h = hist.slice(-n), mx = Math.max(...hist, ui.thr + 5), hits = h.filter((v) => v >= ui.thr).length;
  const rate = h.length ? hits / h.length : null;
  const mate = drv ? p.drivers.find((x) => x.team === drv.team && x.id !== drv.id) : undefined;
  // Where this season's points came from: scoring's own parts, summed by the worker (pass).
  const mix = drv ? ([['Race', drv.mix.race], ['Qualifying', drv.mix.quali], ['Sprint', drv.mix.sprint], ['Fastest lap', drv.mix.fl]] as Array<[string, number]>) : [];
  const mixTotal = mix.reduce((a, [, v]) => a + Math.abs(v), 0);
  // Head to head with the teammate from the classifications: grid, finish, points so far.
  const pace = (id: string) => p.pace.find((r) => r.id === id);
  const pts = (id: string) => p.season.find((r) => r.id === id)?.points ?? 0;
  const h2h: Array<[string, number, number, boolean]> | null = drv && mate && pace(drv.id) && pace(mate.id)
    ? [['Avg grid', pace(drv.id)!.avgGrid, pace(mate.id)!.avgGrid, true], ['Avg finish', pace(drv.id)!.avgFinish, pace(mate.id)!.avgFinish, true], ['Points', pts(drv.id), pts(mate.id), false]]
    : null;
  return (
    <>
      <div><Lbl>Projection · RD {p.round.number}</Lbl>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', marginTop: 8 }}><div className="big num">{d.med}</div><div><Range e={d} /><br /><span className="mut">floor {d.floor} · ceiling {d.ceil}</span></div></div></div>
      {drv && has.splits && mixTotal > 0 ? <div><Lbl>Where the points came from · this season</Lbl>{mix.filter(([, v]) => v !== 0).map(([l, v]) => (
        <Row key={l} cols="1fr 90px 40px" dense><span>{l}</span><Meter pct={(Math.abs(v) / mixTotal) * 100} red={v < 0} /><span className="num">{v < 0 ? '−' : ''}{Math.abs(v)}</span></Row>
      ))}</div> : null}
      <div>
        <div className="th"><Lbl>Hit rate · scored {ui.thr}+</Lbl><span className={`h2 num ${rate !== null && rate >= 0.65 ? 'pos' : rate !== null && rate < 0.45 ? 'red' : ''}`}>{rate === null ? '—' : `${hits}/${h.length}`}</span></div>
        <div className="th" style={{ margin: '8px 0' }}>
          <Tabs value={ui.win} options={['L5', 'L10', 'SEASON'] as const} onChange={(v) => set('win', v)} label="Hit rate window" />
          <span className="srow">{[15, 25, 35, 45].map((t) => <Chip key={t} on={ui.thr === t} onClick={() => set('thr', t)}>{t}+</Chip>)}</span>
        </div>
        {h.length ? null : <Empty>{pass.access === 'pass' ? NOT_PUBLISHED.form : 'Season form and the hit rate come with the Pit Wall Pass.'}</Empty>}
        <div className="bars">{h.map((v, i) => <span key={i} className={v >= ui.thr ? 'hit' : ''} style={{ height: `${(v / mx) * 100}%` }} data-tip={`RD ${p.round.number - h.length + i}: ${v} pts${v >= ui.thr ? ' · hit' : ''}`} />)}<u style={{ bottom: `${(ui.thr / mx) * 100}%` }} /></div>
        <AsTable caption={`Points per round against the ${ui.thr} point line`} head={['Round', 'Points', `${ui.thr}+`]} rows={h.map((v, i) => [`RD ${p.round.number - h.length + i}`, v, v >= ui.thr ? 'hit' : 'miss'])} />
      </div>
      {mate && h2h ? <div><Lbl>Head to head · {mate.name} · this season</Lbl>{h2h.map(([l, a, b, lower]) => {
        // the bar shares are the two values, turned around for grid and finish where lower is better
        const wa = lower ? Math.max(0.1, 25 - a) : Math.max(0.1, a), wb = lower ? Math.max(0.1, 25 - b) : Math.max(0.1, b);
        return (
        <div className="row split" key={l}><span className="num">{lower ? `P${a}` : a}</span><span><span className="mut">{l}</span><span className="sb"><i style={{ flex: wa }} /><em style={{ flex: wb }} /></span></span><span className="num mut" style={{ textAlign: 'right' }}>{lower ? `P${b}` : b}</span></div>
      ); })}</div> : null}
    </>
  );
}

function Past({ d }: { d: Entity }) {
  const { payload: p, has, pass } = useStore();
  const drv = isCtor(d) ? null : d;
  // A constructor has no published per-round series; the example set draws a curve for it.
  const hist = drv ? drv.form : has.mock ? Array.from({ length: 16 }, (_, i) => d.med + Math.round(Math.sin(i) * 12)) : [];
  const mx = Math.max(...hist, 1);
  const overall = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
  // Season profile: this driver's rank among the field on this season's classifications.
  const me = drv ? p.pace.find((r) => r.id === drv.id) : undefined;
  const field = (pick: (r: (typeof p.pace)[number]) => number) => p.pace.map(pick);
  const profile: Array<[string, number]> = me ? [
    ['Qualifying', percentileOf(me.avgGrid, field((r) => r.avgGrid), true)],
    ['Race finish', percentileOf(me.avgFinish, field((r) => r.avgFinish), true)],
    ['Places gained', percentileOf(me.gained, field((r) => r.gained))],
    ['Reliability', percentileOf(me.finishRate, field((r) => r.finishRate))],
    ['Scoring', percentileOf(p.season.find((r) => r.id === drv!.id)?.points ?? 0, p.season.map((r) => r.points))],
  ] : [];
  return (
    <>
      <div><Lbl>Season so far · {hist.length} rounds</Lbl>
        <div className="bars" style={{ marginTop: 10 }}>{hist.map((v, i) => <span key={i} className="hit" style={{ height: `${(v / mx) * 100}%` }} data-tip={`RD ${i + 1}: ${v} pts`} />)}</div>
        <AsTable caption="Points per round this season" head={['Round', 'Points']} rows={hist.map((v, i) => [`RD ${i + 1}`, v])} /></div>
      {/* Splits are this season's points by circuit class (the classes of our characteristics table);
          the arrow is against the season average. Pass only: the free document carries none. */}
      {drv && drv.splits.length ? <div><Lbl>Splits · avg points by circuit class</Lbl>{drv.splits.map((x) => <Row key={x.cls} cols="1fr auto auto auto" dense label={`${x.label}: ${x.avg} points on average over ${x.n} races`}><span>{x.label} <span className="mut">· {x.n}</span></span><span className="num">{x.avg}</span><span className="num"><Arrow n={Math.round(x.avg - overall)} /></span></Row>)}<span className="mut">Against a season average of {overall.toFixed(1)}.</span></div>
        : drv && !has.splits ? <div><Lbl>Splits · avg points by circuit class</Lbl><Empty>{pass.access === 'pass' ? NOT_PUBLISHED.splits.replace('come with the Pit Wall Pass', 'are not published yet') : NOT_PUBLISHED.splits}</Empty></div> : null}
      {profile.length ? <div><Lbl>Season profile · rank among the field</Lbl>{profile.map(([l, v]) => (
        <Row key={l} cols="1fr 110px 30px" dense label={`${l}: better than ${v}% of the field`}><span>{l}</span><Meter pct={v} /><span className="num">{v}</span></Row>
      ))}<span className="mut">Share of the field this driver beats on this season's classifications: grid, finish, places gained, finish rate, points.</span></div>
        : drv ? <div><Lbl>Season profile</Lbl><Empty>{NOT_PUBLISHED.pace}</Empty></div> : null}
    </>
  );
}

function Outlook({ d }: { d: Entity }) {
  const { payload: p, has, pass } = useStore();
  const drv: Driver | null = isCtor(d) ? null : d;
  // The written outlook (F-071): published per driver and round for pass holders; the line built
  // from the numbers below stands in until one exists.
  const [written, setWritten] = useState<OutlookDoc | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    setWritten('loading');
    if (!drv || p.example || pass.access !== 'pass') { setWritten(null); return; }
    void loadOutlook(SEASON, p.round.number, drv.id).then((o) => { if (live) setWritten(o); });
    return () => { live = false; };
  }, [drv?.id, p.round.number, p.asOf, p.example, pass.access]);
  // Only drivers carry a fit. The constructor stand-in below is example data, so it may only be
  // shown where the rest of the page is example data too.
  const fit = drv ? drv.fit : [4, 3, 4, 2, 3, 5];
  const showFit = has.fit && (drv !== null || has.mock);
  const news = p.news.filter((n) => n.entity === d.id || n.entity === d.team || n.entity === null);
  return (
    <>
      {!showFit ? <div><Lbl>Next rounds · circuit fit</Lbl><Empty>{NOT_PUBLISHED.fit}</Empty></div> : null}
      {showFit ? <div><Lbl>Next rounds · circuit fit</Lbl><div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>{fit.map((v, i) => (
        <span key={i} style={{ display: 'grid', gap: 4, justifyItems: 'center' }}><FitCell v={v} label={p.rounds[i]} /><span className="mut" style={{ fontSize: 9 }}>{p.rounds[i]}</span></span>
      ))}</div></div> : null}
      {written && written !== 'loading' ? (
        <div><div className="th"><Lbl>Outlook</Lbl><Pill>Estimate · written by AI</Pill></div>
          <p className="est">{written.text}</p>
          <span className="mut">Built only from: {written.builtFrom.join(', ')}. Written {asOfLabel(written.generatedAt)}; every number and name was checked against those inputs before it was kept.</span></div>
      ) : (
      <div><div className="th"><Lbl>Outlook</Lbl><Pill>Estimate · from the numbers</Pill></div>
        <p className="est">{d.name} goes to {p.round.name} as {d.val > 12 ? 'one of the best values on the board' : 'a premium pick priced near expectation'}{showFit ? `. Long straights ${fit[0] >= 4 ? 'suit the car' : 'expose a straight-line deficit'}` : ''}{drv ? `, and a ${drv.dnf}% retirement risk keeps the floor at ${d.floor}` : ''}. {drv && drv.ptsRise > 0 ? `The price rises above ${drv.ptsRise} points and falls hard below ${drv.ptsHold}; the model puts the rise at ${drv.pRise}%.` : ''}{showFit ? ` The next two rounds are ${fit[1] >= 3 ? 'friendly' : 'harder'}.` : ''}</p>
        <span className="mut">Built only from: the projection model{showFit ? ', circuit fit' : ''}{drv && drv.ptsRise > 0 ? ', the price model' : ''}, {news.length} tagged stories.</span></div>
      )}
      <div><Lbl>Tagged news</Lbl>{news.length ? news.map((n) => <Row key={n.text} cols="90px 1fr"><Pill red={n.tone === '-'}>{n.kind}</Pill><span>{n.text}</span></Row>) : <Empty>{NOT_PUBLISHED.news}</Empty>}</div>
    </>
  );
}

function TrayCompare() {
  const { payload: p, has, ui, togglePin } = useStore();
  const es = ui.tray.map((id) => entity(p, id)).filter((e): e is Entity => Boolean(e));
  const rows: Array<[string, (e: Entity) => string]> = [['Price', (e) => money(e.price)], ['Projection', (e) => String(e.med)], ['Floor', (e) => String(e.floor)], ['Ceiling', (e) => String(e.ceil)], ['Pts per $100', (e) => String(e.val)],
    ['DNF risk %', (e) => (isCtor(e) ? '—' : String(e.dnf))], ['League owned %', (e) => (isCtor(e) || !has.ownership ? '—' : String(e.own))], ['Next price', (e) => (isCtor(e) ? '—' : String(e.dprice))]];
  return (
    <div className="scroll"><table>
      <thead><tr><th scope="col">Metric</th>{es.map((e) => <th key={e.id} scope="col">{e.name} <button type="button" className="linkish" onClick={() => togglePin(e.id)} aria-label={`Remove ${e.name} from compare`}>✕</button></th>)}</tr></thead>
      <tbody>{rows.map(([l, f]) => <tr key={l}><td>{l}</td>{es.map((e) => <td key={e.id}>{f(e)}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

/** Right slide-over: depth comes from here, so pages never grow past the three-screen budget. */
export function SlideOver() {
  const { payload: p, ui, set, close, togglePin, setAce, saving, purse } = useStore();
  const ref = useRef<HTMLElement>(null);
  const showRec = ui.recOver !== null;
  const showTray = ui.over === 'TRAY';
  const d = ui.over && !showTray ? entity(p, ui.over) : undefined;
  const openNow = showRec || showTray || Boolean(d);
  useEffect(() => {
    if (!openNow) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [openNow, close]);
  if (!openNow) return null;

  let title = 'Compare', sub = 'UP TO THREE, ACROSS PAGES', body;
  if (showRec) {
    const rec = briefRecs(p, ui.lineup, purse)[ui.recOver!];
    title = rec?.title ?? 'Recommendation'; sub = 'RECOMMENDATION';
    body = rec ? <Compare rec={rec} instant /> : null;
  } else if (showTray) {
    body = <TrayCompare />;
  } else if (d) {
    const mine = ui.lineup.drivers.includes(d.id) || ui.lineup.ctor === d.id;
    title = d.name; sub = isCtor(d) ? 'CONSTRUCTOR' : `#${d.num} · ${p.teams[d.team]?.name ?? ''}`;
    body = (
      <>
        <div style={{ marginTop: -6 }}><TeamBar p={p} team={d.team} /><span className="num">{money(d.price)}</span>{!isCtor(d) ? <> · next <Arrow n={d.dprice} /></> : null} · {mine ? <span className="red">IN YOUR LINEUP</span> : <span className="mut">not owned</span>}</div>
        <div className="srow"><Tabs value={ui.overTab === 'COMPARE' ? 'PRESENT' : ui.overTab} options={(isCtor(d) ? ['PAST', 'PRESENT', 'OUTLOOK'] : ['PAST', 'PRESENT', 'OUTLOOK', 'MOONSHOT']) as readonly ('PAST' | 'PRESENT' | 'OUTLOOK' | 'MOONSHOT')[]} onChange={(v) => set('overTab', v)} small={false} label="Detail views" /></div>
        <div className="srow">
          <button type="button" className="ghost" onClick={() => togglePin(d.id)} aria-pressed={ui.tray.includes(d.id)}>{ui.tray.includes(d.id) ? 'Pinned to compare ✓' : 'Pin to compare'}</button>
          {/* the ace can be moved from wherever a driver of the lineup is shown */}
          {!isCtor(d) && ui.lineup.drivers.includes(d.id) ? (ui.lineup.ace === d.id
            ? <button type="button" className="chip acepill-inline" aria-pressed="true" onClick={() => setAce(d.id)} disabled={!!saving} title="Tap to clear the ace">ACE 2× · clear</button>
            : <button type="button" className="ghost" onClick={() => setAce(d.id)} disabled={!!saving}>{d.price > ACE_MAX_PRICE ? `Ace needs ≤ ${money(ACE_MAX_PRICE)}` : 'Make ace'}</button>) : null}
        </div>
        {ui.overTab === 'PAST' ? <Past d={d} /> : ui.overTab === 'OUTLOOK' ? <Outlook d={d} /> : ui.overTab === 'MOONSHOT' && !isCtor(d) ? <MoonshotPanel driverId={d.id} driverName={d.name} /> : <Present d={d} />}
      </>
    );
  }
  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <aside className="over" role="dialog" aria-modal="true" aria-label={`${title} detail`} tabIndex={-1} ref={ref}>
        <div className="th"><span className="mut">{sub}</span><button type="button" className="ghost" onClick={close}>Close ✕</button></div>
        <div className="brand"><h1 style={{ fontSize: 24, whiteSpace: 'normal' }}>{title}</h1></div>
        {body}
      </aside>
    </>
  );
}

/** Pinned compare tray: holds up to three entities and follows the user across pages. */
export function CompareTray() {
  const { payload: p, ui, set, togglePin } = useStore();
  if (ui.tray.length === 0) return null;
  return (
    <div className="tray" role="region" aria-label="Compare tray">
      <Lbl>Compare</Lbl>
      {ui.tray.map((id) => { const e = entity(p, id); return e ? (
        <span key={id} className="chip"><TeamBar p={p} team={e.team} />{e.name}<button type="button" onClick={() => togglePin(id)} aria-label={`Remove ${e.name}`}>✕</button></span>
      ) : null; })}
      <button type="button" className="ghost" disabled={ui.tray.length < 2} onClick={() => set('over', 'TRAY')}>Compare {ui.tray.length} →</button>
    </div>
  );
}
