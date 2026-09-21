import { briefRecs, entity, money, projected, rateMyTeam, rivalMove } from '../data/logic';
import { useStore } from '../state';
import { Arrow, Meter, Money, Pill, Row, Tabs, TeamBar, Tile } from '../ui/bits';
import { Compare } from '../ui/Compare';

export function Briefing() {
  const { payload: p, ui, set, open, go } = useStore();
  const recs = briefRecs(p, ui.lineup);
  const sel = Math.min(ui.rec, recs.length - 1);
  const proj = projected(p, ui.lineup);
  const flags = ui.lineup.drivers.filter((id) => p.news.some((n) => n.entity === id && n.kind === 'PENALTY')).length;

  const rivals = p.rivals.map((r) => rivalMove(p, ui.lineup, r)).filter((v) => v !== null);
  const rivalsBody = (
    <>
      {rivals.map((v) => (
        <Row key={v.name} two cols="1fr auto" onClick={() => open(v.in.id)} label={`${v.name}: likely ${v.out.name} to ${v.in.name}, ${v.likely}% likely`}
          tip={`${v.name} · ${v.activity < 0.35 ? 'rarely edits their lineup' : 'edits most weeks'}\nBank ${money(v.bank)} · best affordable gain +${v.gain} pts`}>
          <span><b>{v.name}</b> <span className="mut">P{v.rank} · {v.gap > 0 ? `+${v.gap} ahead` : `${-v.gap} behind`}</span><br />
            <span className="mut">{v.out.name} →</span> <TeamBar p={p} team={v.in.team} />{v.in.name} <span className="mut">{v.likely}% likely</span></span>
          <span><Pill red={v.tag === 'THREAT'}>{v.tag}</Pill></span>
        </Row>
      ))}
      <span className="mut">{p.league.name} · you are P{p.league.myRank}. Based on each rival's bank, best swap and how often they edit.</span>
    </>
  );
  const moversBody = [...p.drivers].sort((a, b) => Math.abs(b.dprice) - Math.abs(a.dprice)).slice(0, 5).map((d) => (
    <Row key={d.id} cols="1fr auto auto" onClick={() => open(d.id)} label={`${d.name}, ${money(d.price)}, predicted move ${d.dprice}`}>
      <span><TeamBar p={p} team={d.team} />{d.name}</span><span className="mut"><Money n={d.price} /></span><span className="num"><Arrow n={d.dprice} /></span>
    </Row>
  ));
  const weatherBody = (
    <>
      {([['FP1 · Fri', 5], ['Quali · Sat', 15], ['Race · Sun', 35]] as Array<[string, number]>).map(([s, pct]) => (
        <Row key={s} cols="90px 1fr 40px"><span>{s}</span><Meter pct={pct} red={pct > 30} /><span className="num">{pct}%</span></Row>
      ))}
      <span className="mut">Rain probability. Click a driver anywhere for their wet against dry delta.</span>
    </>
  );

  return (
    <div className="page">
      <Tile span="c8" label="What changed since yesterday" right={<span className="mut only-wide">5 min read · links out to sources</span>}>
        {p.news.slice(0, 4).map((n) => {
          const e = n.entity ? entity(p, n.entity) : undefined;
          return (
            <Row key={n.text} cols="96px 1fr auto" onClick={e ? () => open(e.id) : undefined} label={`${n.kind}: ${n.text}`}>
              <Pill red={n.tone === '-'}>{n.kind}</Pill><span>{e ? <TeamBar p={p} team={e.team} /> : null}{n.text}</span><span className="mut only-wide">{n.sources}</span>
            </Row>
          );
        })}
      </Tile>
      <Tile span="c4" variant="you" label="Your lineup">
        <div className="big num">{proj}</div>
        <div className="mut">Projected points · range {Math.round(proj * 0.72)} to {Math.round(proj * 1.3)}</div>
        <Row two cols="1fr auto"><span>Rate my team</span><span className="num">{rateMyTeam(p, ui.lineup)} / 100</span></Row>
        <Row two cols="1fr auto"><span>Flags</span><span className={flags ? 'red' : 'mut'}>{flags} penalty risk · 0 open slots</span></Row>
        <button className="cta" type="button" onClick={() => go('LINEUP LAB')}>Open lineup lab →</button>
      </Tile>
      <Tile span="c12" label="Recommendations · your lineup against the data" right={<span className="mut">Click a recommendation to compare</span>}>
        <div className="recgrid">
          <div>
            {recs.map((x, i) => (
              <Row key={x.title} pad cols="54px 1fr auto" selected={i === sel} label={`${x.kind}: ${x.title}, ${x.tag}`}
                onClick={() => { set('rec', i); if (window.matchMedia('(max-width: 980px)').matches) set('recOver', i); }}>
                <Pill red={x.bad}>{x.kind}</Pill><span><b>{x.title}</b></span><span className={`num ${x.good ? 'pos' : x.bad ? 'red' : 'mut'}`}>{x.tag}</span>
              </Row>
            ))}
          </div>
          {/* on narrow screens the comparison opens as a slide-over instead of lengthening the page */}
          <div className="only-cmp-wide">{recs[sel] ? <Compare rec={recs[sel]} /> : null}</div>
        </div>
      </Tile>
      <Tile span="c4 only-wide" label="Rivals · likely moves">{rivalsBody}</Tile>
      <Tile span="c4 only-wide" label="Price movers · predicted">{moversBody}</Tile>
      <Tile span="c4 only-wide" label={`Weather · ${p.round.name}`}>{weatherBody}</Tile>
      <Tile span="c12 only-narrow" label="This weekend" right={<Tabs value={ui.lowerTab} options={['RIVALS', 'MOVERS', 'WEATHER'] as const} onChange={(v) => set('lowerTab', v)} label="Weekend frames" />}>
        {ui.lowerTab === 'RIVALS' ? rivalsBody : ui.lowerTab === 'MOVERS' ? moversBody : weatherBody}
      </Tile>
    </div>
  );
}
