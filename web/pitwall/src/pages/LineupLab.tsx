import { useEffect } from 'react';
import { OPEN_SEAT, entity, money, projectedLineup, swapPool, swapRecs, topPickRec } from '../data/logic';
import { loadHindsight } from '../lib/hindsightApi';
import type { HindsightRow } from '../data/hindsight';
import { isCtor, type Entity } from '../data/types';
import { useState } from 'react';
import { useStore } from '../state';
import { ACE_MAX_PRICE, aceChange } from '../data/team';
import { RealRoster, SavePreview } from '../ui/RealLineup';
import { Empty, Arrow, AsTable, FitCell, Pill, TeamBar, Tile, Tr } from '../ui/bits';
import { Compare } from '../ui/Compare';
import { Locked } from '../ui/Locked';
import { PassBar } from '../ui/PassBar';

export function LineupLab() {
  const { payload: p, has, ui, purse, plan, toggleSlot, swapInSlot, applyAct, setAce, save, reset, dirty, real, saving, selectTeam } = useStore();
  const [confirming, setConfirming] = useState(false);
  // With a real team the roster, bank and lock come from the server's documents; projections stay example data.
  const ace = real ? aceChange(real.team, ui.lineup, real.market) : null;
  const blocked = plan?.blocked ?? ace?.blocked ?? null;
  const l = ui.lineup, room = purse.room, slot = ui.slot, isC = slot === 'CTOR';
  const cur = slot ? entity(p, isC ? l.ctor : slot) : undefined;
  const pool = slot ? swapPool(p, l, slot, purse) : [];
  const proj = projectedLineup(p, l);
  const hindsight = [78, 64, 91, 55, 83];
  // Real hindsight from the team's snapshots, loaded when the lab opens; the example set keeps its bars.
  const [rows, setRows] = useState<HindsightRow[] | null>(null);
  useEffect(() => { let live = true; setRows(null); if (real) void loadHindsight(real.team.id).then((r) => { if (live) setRows(r); }); return () => { live = false; }; }, [real?.team.id]);

  const tile = (e: Entity, ctor: boolean) => {
    const key = ctor ? 'CTOR' : e.id, ace = !ctor && e.id === l.ace;
    return (
      <button key={key} type="button" className={`dt ${ctor ? 'ctor' : ''}`} aria-pressed={slot === key} aria-label={`${e.name}, ${money(e.price)}, projected ${e.med * (ace ? 2 : 1)}${ace ? ', ace' : ''}. Show swaps`} onClick={() => toggleSlot(key)}>
        <span style={{ display: 'flex', justifyContent: 'space-between' }} className="mut">
          <span>{ctor ? <span className="red">TEAM</span> : isCtor(e) ? '' : e.num}{ace ? <> <Pill red>ACE 2×</Pill></> : null}</span><span className="num">{money(e.price)}</span>
        </span>
        <span><span className="nm">{e.name}</span>
          <span style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span><TeamBar p={p} team={e.team} /></span><span className="num">{e.med * (ace ? 2 : 1)} proj</span></span></span>
      </button>
    );
  };
  const stat = (x: Entity) => isCtor(x)
    ? <><td>{money(x.price)}</td><td><b>{x.med}</b></td><td>{x.val}</td></>
    : <><td>{money(x.price)}</td><td><b>{x.med}</b></td><td>{x.val}</td>{has.fit ? <td><FitCell v={x.fit[0]} label={p.rounds[0]} /></td> : null}<td>{x.dnf}%</td><td><Arrow n={x.dprice} /></td></>;
  const top = slot ? topPickRec(p, l, slot, purse) : null;

  return (
    <div className="page">
      <PassBar feature="briefing.recommendations" what="Swap recommendations, the comparison behind each one, and every rival's likely move come with the pass." />
      <div className="c6" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <section className="tile open">
          <div className="th">
            <span className="lbl">
              {real && real.teams.length > 1 ? (
                <span className="srow">Lineup ·
                  {real.teams.map((t) => (
                    <button key={t.id} type="button" className="chip" aria-pressed={t.id === real.team.id} disabled={!!saving} onClick={() => selectTeam(t.id)}>{t.name}</button>
                  ))}
                </span>
              ) : <>Lineup · {real ? real.team.name : 'example'}</>}
              {' · '}{real?.team.isLocked ? <span className="red">locked this weekend</span> : dirty ? <span className="red">unsaved changes</span> : 'saved'}
            </span>
            <span className="mut">Tap a tile to see swaps</span>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>{proj.complete ? <div className="big num">{proj.points}</div> : null}<span className="mut">{proj.complete ? 'Projected pts' : `No total: ${proj.missing} pick${proj.missing === 1 ? ' is' : 's are'} not projected here`}</span></div>
            <div><div className="h2 num">{money(plan ? plan.bankAfter : room)}</div><span className="mut">{plan && plan.changed ? 'Bank after this save' : 'Bank'}{real ? '' : ` of ${money(p.budget)}`}</span></div>
            {real || !proj.complete ? null : <div><div className="h2 num">{Math.min(99, Math.round(18 + proj.points / 9))}%</div><span className="mut">League win chance</span></div>}
          </div>
          {real ? <RealRoster /> : <div className="lineup">{l.drivers.map((id) => tile(entity(p, id)!, false))}{tile(entity(p, l.ctor)!, true)}</div>}
          {blocked && dirty ? <p className="err" role="alert" style={{ margin: 0 }}>{blocked}</p> : null}
          <div className="th">
            {real ? (
              <button type="button" className="cta" disabled={!dirty || !!blocked || !!saving} onClick={() => setConfirming(true)}>{saving ?? (dirty ? 'Save lineup' : 'No changes')}</button>
            ) : (
              <button type="button" className="cta" disabled={!dirty} onClick={() => void save()}>{dirty ? 'Keep this what-if' : 'No changes'}</button>
            )}
            <button type="button" className="ghost" onClick={reset} disabled={!!saving}>Reset</button>
            <span className="mut">{real ? 'Saves through the same server rules as the app: budget, fees, contracts and locks are checked there.' : 'Sign in to edit your real team here.'}</span>
          </div>
          {confirming && plan ? <SavePreview plan={plan} aceTo={ace?.to ?? null} onCancel={() => setConfirming(false)} onConfirm={async () => { setConfirming(false); await save(); }} /> : null}
        </section>
        <Tile label="Hindsight · last 5 rounds" right={<span className="mut only-wide">What you scored against the best the same money could buy</span>}>
          {real ? (
            rows === null ? <span className="mut">Working out the best lineup for each round…</span>
            : rows.length === 0 ? <Empty>No scored round on record for this team yet. Hindsight starts with the first weekend scored after round 17, when the roster snapshots began.</Empty>
            : <>
              <div className="bars" style={{ height: 56 }}>{rows.map((r) => <span key={r.raceId} className="hit" style={{ height: `${r.share}%` }} data-tip={`RD ${r.round}: you scored ${r.actual} of a possible ${r.best} (${r.share}%)\nBest for ${money(r.spend)}: ${r.bestLineup.drivers.map((id) => entity(p, id)?.name ?? id).join(', ')} + ${entity(p, r.bestLineup.ctor)?.name ?? r.bestLineup.ctor}${r.bestLineup.ace ? ` · ace ${entity(p, r.bestLineup.ace)?.name ?? r.bestLineup.ace}` : ''}`} />)}</div>
              <span className="mut">{rows.length === 1 ? `Round ${rows[0].round}: ${rows[0].actual} of a possible ${rows[0].best} points, ${rows[0].share}%.` : `Your score as a share of the best lineup the same money could have bought, per round.`} Hover a bar for that lineup.</span>
              <AsTable caption="Share of the best affordable lineup scored per round" head={['Round', 'You', 'Best possible', 'Share', 'Best lineup']} rows={rows.map((r) => [`RD ${r.round}`, r.actual, r.best, `${r.share}%`, `${r.bestLineup.drivers.map((id) => entity(p, id)?.name ?? id).join(', ')} + ${entity(p, r.bestLineup.ctor)?.name ?? r.bestLineup.ctor}`])} />
            </>
          ) : !has.mock ? <Empty>Hindsight needs a signed-in team: what your lineup scored against the best the same money could have bought.</Empty> : <>
          <div className="bars" style={{ height: 56 }}>{hindsight.map((v, i) => <span key={i} className="hit" style={{ height: `${v}%` }} data-tip={`You scored ${v}% of the optimal lineup`} />)}</div>
          <span className="mut">Your score as a share of the best possible lineup. Ace calls cost you most: 2 of 5 correct.</span>
          <AsTable caption="Share of the optimal lineup scored per round" head={['Round', 'Share of optimal']} rows={hindsight.map((v, i) => [`RD ${p.round.number - 5 + i}`, `${v}%`])} />
          </>}
        </Tile>
      </div>
      <div className="c6" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slot && (cur || slot === OPEN_SEAT || isC) ? (
          <>
            {cur ? (
              <Tile label={`Replace ${cur.name} · top pick`} right={<span className="mut only-wide">Which swap the data backs</span>}>
                <Locked feature="briefing.recommendations">
                  {top ? <Compare rec={top} /> : <span className="mut">Nothing affordable. Free budget elsewhere first.</span>}
                </Locked>
                {!isC ? (cur.price > ACE_MAX_PRICE
                  ? <span className="mut">Only a pick at {money(ACE_MAX_PRICE)} or under can be the ace; {cur.name} is {money(cur.price)}.</span>
                  : <button type="button" className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAce(cur.id)} disabled={l.ace === cur.id}>{l.ace === cur.id ? 'Ace is on this driver' : `Make ${cur.name} the ace`}</button>) : null}
              </Tile>
            ) : (
              <Tile label={isC ? 'Empty constructor seat' : 'Open driver seat'}>
                <span className="mut">{pool.length ? `${pool.length} option${pool.length === 1 ? '' : 's'} fit in the ${money(room)} bank. The best projection leads.` : `Nothing fits in the ${money(room)} bank. Sell something first, or wait for prices to move.`}</span>
              </Tile>
            )}
            <Tile label={`All options within ${money(room)} bank · tap to ${cur ? 'swap' : 'fill the seat'}`}>
              <div className="scroll"><table>
                <thead><tr><th scope="col">{isC ? 'Team' : 'Driver'}</th><th scope="col">Gain</th><th scope="col">Price</th><th scope="col">Proj</th><th scope="col">Pts/$100</th>{isC ? null : <>{has.fit ? <th scope="col">Fit</th> : null}<th scope="col">DNF</th><th scope="col">Next $</th></>}</tr></thead>
                <tbody>
                  {cur ? <tr className="me"><td><TeamBar p={p} team={cur.team} /><b>{cur.name}</b> <span className="mut">now</span></td><td className="mut">—</td>{stat(cur)}</tr> : null}
                  {pool.map(({ e, gain }, n) => (
                    <Tr key={e.id} onClick={() => swapInSlot(e.id)} label={`Swap in ${e.name}, ${gain > 0 ? 'plus' : 'minus'} ${Math.abs(gain).toFixed(0)} points`}>
                      <td><TeamBar p={p} team={e.team} /><b>{e.name}</b>{n === 0 && gain > 0 ? <> <Pill red>TOP</Pill></> : null}</td>
                      <td className={gain > 0 ? 'pos' : 'red'}><b>{gain > 0 ? '+' : ''}{gain.toFixed(0)}</b></td>{stat(e)}
                    </Tr>
                  ))}
                </tbody>
              </table></div>
              {purse.unavailable.size ? <span className="mut">{purse.unavailable.size} driver{purse.unavailable.size === 1 ? '' : 's'} you sold recently {purse.unavailable.size === 1 ? 'is' : 'are'} not listed: the game holds a sold driver back until the next race has been scored.</span> : null}
            </Tile>
          </>
        ) : (
          <Tile label="Recommended moves">
           <Locked feature="briefing.recommendations">
            {swapRecs(p, l, purse).length === 0 ? <span className="mut">Your lineup is the best available within budget.</span> : swapRecs(p, l, purse).map((x) => { const o = entity(p, x.out)!, n = entity(p, x.in)!; return (
              <div key={`${x.out}${x.in}`} className="row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span><span className="mut">{o.name} →</span> <b>{n.name}</b><br /><span className="mut">{x.cost >= 0 ? `Costs ${money(x.cost)}` : `Frees ${money(-x.cost)}`}{!isCtor(n) ? `${has.fit ? ` · circuit fit ${n.fit[0]}/5` : ''} · ${n.dprice > 0 ? 'price rising' : 'price flat'}` : ''}</span></span>
                <span className="pos num">+{x.gain.toFixed(0)}</span><button type="button" className="ghost" onClick={() => applyAct(`${x.out}:${x.in}`)}>Try</button>
              </div>
            ); })}
           </Locked>
          </Tile>
        )}
      </div>
    </div>
  );
}
