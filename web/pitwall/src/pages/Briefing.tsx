import { briefRecs, money, rivalMove } from '../data/logic';
import { useStore } from '../state';
import { Arrow, Empty, Money, Pill, Row, Tabs, TeamBar, Tile } from '../ui/bits';
import { NOT_PUBLISHED } from '../data/coverage';
import { WeatherMap } from '../ui/WeatherMap';
import { forBriefing, newsKey } from '../data/wire';
import { NewsRow } from '../ui/NewsRow';
import { Calls } from '../ui/Calls';
import { Locked } from '../ui/Locked';
import { PassBar } from '../ui/PassBar';
import { Hero } from '../ui/Hero';
import { LineupTiles } from '../ui/LineupTiles';
import { MoonshotTile, MoonshotRivals } from '../ui/Moonshot';

export function Briefing() {
  const { payload: p, has, pass, wire, purse, ui, set, open } = useStore();
  // the next ten this reader has not marked read, in their order
  const briefing = forBriefing(p.news, wire, 10);
  const recs = briefRecs(p, ui.lineup, purse);
  // The free document publishes the top ten medians and zeroes the rest, so this is exactly what
  // the reader is entitled to see, whether or not they hold a pass.
  const topTen = [...p.drivers].filter((d) => d.med > 0).sort((a, b) => b.med - a.med).slice(0, 10);
  
  const topRows = (list: typeof topTen) => list.map((d, i) => (
    <Row key={d.id} cols="24px 1fr auto" dense onClick={() => open(d.id)} label={`${d.name}, projected ${d.med} points`}>
      <span className="mut num">{i + 1}</span>
      <span><TeamBar p={p} team={d.team} />{d.name}{ui.lineup.drivers.includes(d.id) ? <span className="mut"> · yours</span> : null}</span>
      <span className="num">{d.med}</span>
    </Row>
  ));
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
      <Hero />
      <PassBar feature="briefing.recommendations" what="The swaps the data backs, every rival's likely move, and the ranges and price model behind them come with the pass." />
      {/* Two separate tiles, never one wearing the other's hat. The wire leads when it has
          something; the top ten always has something, so it takes the slot when the wire does not
          and the page never opens on an empty headline list. */}
      {/* Two columns, each its own flow, so a short wire never leaves a hole beside a tall column
          (a grid row would stretch to the tallest tile in it): the wire, the top ten and the rivals
          on the left; the reader's own tile, the price movers and the weather on the right. On a
          phone the reader's own tile comes first, then the wire, then the top five. */}
      <Locked feature="briefing.recommendations"><Calls recs={recs} /></Locked>
      <div className="cols">
      <div className="stack side">
      <LineupTiles />
      <MoonshotTile />
      <Tile span="only-wide" label="Price movers · predicted"><div className="list">{moversBody}</div></Tile>
      <Tile span="only-wide" label={`Top ten for ${p.round.name || 'this round'}`} right={<span className="mut only-wide">Projected points for the coming round</span>}>
        <div className="list">
        {topRows(topTen)}
        </div>
      </Tile>
      </div>
      <div className="stack main">
      {has.news ? (
        <Tile label={<><span className="only-narrow">What changed since yesterday</span><span className="only-wide h2 calls-h" style={{ color: 'var(--fg)' }}>The wire</span></>} right={<span className="mut only-wide">{briefing.length ? `${briefing.length} unread · links out to sources` : 'links out to sources'}</span>}>
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
      <Tile span="only-wide" label="Rivals · likely moves"><Locked feature="briefing.rivals"><div className="list">{rivalsBody}</div></Locked><MoonshotRivals /></Tile>
      <Tile span="only-wide" label={`Weather · ${p.round.name}`}>{weatherBody}</Tile>
      </div>
      </div>
      <Tile span="c12 only-narrow" label="This weekend" right={<Tabs value={ui.lowerTab} options={['TOP 5', 'RIVALS', 'MOVERS', 'WEATHER'] as const} onChange={(v) => set('lowerTab', v)} label="Weekend frames" />}>
        {ui.lowerTab === 'TOP 5' ? <div className="list">{topRows(topTen.slice(0, 5))}</div> : ui.lowerTab === 'RIVALS' ? <><Locked feature="briefing.rivals">{rivalsBody}</Locked><MoonshotRivals /></> : ui.lowerTab === 'MOVERS' ? moversBody : weatherBody}
      </Tile>
    </div>
  );
}
