import { briefRecs, money, projectedLineup, rateMyTeam, rivalMove } from '../data/logic';
import { useStore } from '../state';
import { Arrow, Empty, Money, Pill, Row, Tabs, TeamBar, Tile } from '../ui/bits';
import { NOT_PUBLISHED } from '../data/coverage';
import { WeatherMap } from '../ui/WeatherMap';
import { forBriefing, newsKey } from '../data/wire';
import { NewsRow } from '../ui/NewsRow';
import { Compare } from '../ui/Compare';
import { Locked } from '../ui/Locked';

export function Briefing() {
  const { payload: p, has, pass, wire, ui, set, open, go } = useStore();
  // the next ten this reader has not marked read, in their order
  const briefing = forBriefing(p.news, wire, 10);
  const recs = briefRecs(p, ui.lineup);
  const sel = Math.min(ui.rec, recs.length - 1);
  const proj = projectedLineup(p, ui.lineup);
  // The free document publishes the top ten medians and zeroes the rest, so this is exactly what
  // the reader is entitled to see, whether or not they hold a pass.
  const topTen = [...p.drivers].filter((d) => d.med > 0).sort((a, b) => b.med - a.med).slice(0, 10);
  const flags = ui.lineup.drivers.filter((id) => p.news.some((n) => n.entity === id && n.kind === 'PENALTY')).length;

  const rivals = p.rivals.map((r) => rivalMove(p, ui.lineup, r)).filter((v) => v !== null);
  const rivalsBody = !has.rivals ? <Empty>{NOT_PUBLISHED.rivals} Likely moves need every rival's lineup and bank, which the worker does not collect yet.</Empty> : (
    <>
      {rivals.map((v) => (
        <Row key={v.name} two cols="1fr auto" onClick={() => open(v.in.id)} label={`${v.name}: likely ${v.out.name} to ${v.in.name}, ${v.likely}% likely`}
          tip={`${v.name} · ${v.activity < 0.35 ? 'rarely edits their lineup' : 'edits most weeks'}\nBank ${money(v.bank)} · best affordable gain +${v.gain} pts`}>
          <span><b>{v.name}</b> <span className="mut">P{v.rank} · {v.gap > 0 ? `+${v.gap} ahead` : `${-v.gap} behind`}</span><br />
            <span className="mut">{v.out.name} →</span> <TeamBar p={p} team={v.in.team} />{v.in.name} <span className="mut">{v.likely}% likely</span></span>
          <span><Pill red={v.tag === 'THREAT'}>{v.tag}</Pill></span>
        </Row>
      ))}
      <span className="mut">{has.league ? `${p.league.name} · you are P${p.league.myRank}. ` : ''}Based on each rival's bank, best swap and how often they edit.</span>
    </>
  );
  // The predicted move is part of the price model. Without it every row reads "0", which is a
  // ranking of nothing presented as a prediction.
  const moversBody = !has.priceModel
    ? <Empty>{pass.access === 'pass' ? NOT_PUBLISHED.priceModel : 'The predicted price move comes with the Pit Wall Pass.'}</Empty>
    : [...p.drivers].sort((a, b) => Math.abs(b.dprice) - Math.abs(a.dprice)).slice(0, 5).map((d) => (
    <Row key={d.id} cols="1fr auto auto" onClick={() => open(d.id)} label={`${d.name}, ${money(d.price)}, predicted move ${d.dprice}`}>
      <span><TeamBar p={p} team={d.team} />{d.name}</span><span className="mut"><Money n={d.price} /></span><span className="num"><Arrow n={d.dprice} /></span>
    </Row>
  ));
  // These percentages are invented, and a forecast is exactly the sort of thing a reader will take
  // at face value, so they may only be drawn where the rest of the page is example data too.
  // Real forecast, per session, from the payload. Amounts rather than chances, because that is
  // what the source measures; a fabricated probability is exactly what this tile used to show.
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short' });
  const weatherBody = !has.weather && !has.weatherMap ? <Empty>{NOT_PUBLISHED.weather}</Empty> : (
    <>
      {has.weatherMap && p.weatherMap ? <WeatherMap map={p.weatherMap} /> : <span className="mut">{NOT_PUBLISHED.weatherMap}</span>}
      <div className="list">
      {p.weather.map((w) => (
        <Row key={w.key} cols="1fr auto auto" dense label={`${w.label}: ${w.sky ?? ''}${w.tempC !== null ? `, ${w.tempC} degrees` : ''}${w.rainMm !== null ? `, ${w.rainMm} millimetres of rain` : ''}`}>
          <span>{w.label} <span className="mut">· {day(w.at)}{w.sky ? ` · ${w.sky}` : ''}</span></span>
          <span className="num">{w.tempC !== null ? `${w.tempC}°` : '—'}</span>
          <span className={`num ${w.rainMm !== null && w.rainMm >= 1 ? 'red' : ''}`}>{w.rainMm !== null ? `${w.rainMm} mm` : '—'}</span>
        </Row>
      ))}
      </div>
      <span className="mut">Rain is the amount expected in the session's hour. {p.weatherSource ?? ''}</span>
    </>
  );

  return (
    <div className="page">
      {/* Two separate tiles, never one wearing the other's hat. The wire leads when it has
          something; the top ten always has something, so it takes the slot when the wire does not
          and the page never opens on an empty headline list. */}
      {/* Two columns, each its own flow, so a short wire never leaves a hole beside a tall column
          (a grid row would stretch to the tallest tile in it): the wire, the top ten and the rivals
          on the left; the reader's own tile, the price movers and the weather on the right. On a
          phone the reader's own tile comes first, then the wire, then the top five. */}
      <div className="c4 stack first-narrow">
      <Tile variant="you" label="Your lineup">
        {proj.complete ? <>
          <div className="big num">{proj.points}</div>
          <div className="mut">Projected points · range {Math.round(proj.points * 0.72)} to {Math.round(proj.points * 1.3)}</div>
        </> : (
          <div className="mut">{pass.access === 'pass'
            ? `No projected total: ${proj.missing} of your picks ${proj.missing === 1 ? 'is' : 'are'} not projected for this round, and adding the rest up would be wrong.`
            : `No projected total: the free view carries only the top ten, and ${proj.missing} of your picks ${proj.missing === 1 ? 'is' : 'are'} outside it. The whole board comes with the pass.`}</div>
        )}
        <div className="list">
          <Row two cols="1fr auto" dense><span>Rate my team</span><span className="num">{proj.complete ? `${rateMyTeam(p, ui.lineup)} / 100` : '—'}</span></Row>
          <Row two cols="1fr auto" dense><span>Flags</span><span className={flags ? 'red' : 'mut'}>{flags} penalty risk · 0 open slots</span></Row>
        </div>
        <button className="cta" type="button" onClick={() => go('LINEUP LAB')}>Open lineup lab →</button>
      </Tile>
      <Tile span="only-wide" label="Price movers · predicted"><div className="list">{moversBody}</div></Tile>
      <Tile span="only-wide" label={`Weather · ${p.round.name}`}>{weatherBody}</Tile>
      </div>
      <div className="c8 stack">
      {has.news ? (
        <Tile label="What changed since yesterday" right={<span className="mut only-wide">{briefing.length ? `${briefing.length} unread · links out to sources` : 'links out to sources'}</span>}>
          {briefing.length === 0 ? <Empty>You are caught up. New headlines appear here as the feeds carry them.</Empty> : null}
          {/* Ten on a wide screen, five on a phone, same as the top ten; the Wire carries all of them. */}
          <div className="list">{briefing.map((n, i) => <div key={newsKey(n)} className={i >= 5 ? 'only-wide' : undefined}><NewsRow n={n} /></div>)}</div>
          {briefing.length > 5 ? <span className="mut only-narrow">{briefing.length - 5} more unread on the Wire.</span> : null}
        </Tile>
      ) : null}
      {/* Ten on a wide screen, five on a phone: the board has the whole grid, and on a phone the
          extra five cost more scroll than they earn on the page people open first. */}
      {/* The reader's own tile sits at the top right. Its column runs down beside both the wire and
          the top ten (price movers, then the weather), so neither side leaves a hole. Rivals,
          mostly "not published" today, gets the full width at the bottom. */}
      <Tile label={<><span className="only-wide">Top ten</span><span className="only-narrow">Top five</span> for {p.round.name || 'this round'}</>} right={<span className="mut only-wide">Projected points for the coming round</span>}>
        <div className="list">
        {topTen.map((d, i) => (
          <div key={d.id} className={i >= 5 ? 'only-wide' : undefined}>
          <Row cols="24px 1fr auto" dense onClick={() => open(d.id)} label={`${d.name}, projected ${d.med} points`}>
            <span className="mut num">{i + 1}</span>
            <span><TeamBar p={p} team={d.team} />{d.name}{ui.lineup.drivers.includes(d.id) ? <span className="mut"> · yours</span> : null}</span>
            <span className="num">{d.med}</span>
          </Row>
          </div>
        ))}
        </div>
      </Tile>
      <Tile span="only-wide" label="Rivals · likely moves"><Locked feature="briefing.rivals"><div className="list">{rivalsBody}</div></Locked></Tile>
      </div>
      <Tile span="c12" label="Recommendations · your lineup against the data" right={<span className="mut">Click a recommendation to compare</span>}>
       <Locked feature="briefing.recommendations">
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
       </Locked>
      </Tile>
      <Tile span="c12 only-narrow" label="This weekend" right={<Tabs value={ui.lowerTab} options={['RIVALS', 'MOVERS', 'WEATHER'] as const} onChange={(v) => set('lowerTab', v)} label="Weekend frames" />}>
        {ui.lowerTab === 'RIVALS' ? <Locked feature="briefing.rivals">{rivalsBody}</Locked> : ui.lowerTab === 'MOVERS' ? moversBody : weatherBody}
      </Tile>
    </div>
  );
}
