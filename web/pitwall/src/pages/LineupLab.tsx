import { bank, entity, money, projectedLineup, swapPool, swapRecs, topPickRec } from '../data/logic';
import { isCtor, type Entity } from '../data/types';
import { useState } from 'react';
import { useStore } from '../state';
import { aceChange, planSave, CONTRACT_LENGTH } from '../data/team';
import { RealRoster, SavePreview } from '../ui/RealLineup';
import { Empty, Arrow, AsTable, FitCell, Pill, TeamBar, Tile, Tr } from '../ui/bits';
import { Compare } from '../ui/Compare';

export function LineupLab() {
  const { payload: p, has, ui, toggleSlot, swapInSlot, applyAct, setAce, save, reset, dirty, real, saving, selectTeam } = useStore();
  const [confirming, setConfirming] = useState(false);
  // With a real team the roster, bank and lock come from the server's documents; projections stay example data.
  const plan = real ? planSave(real.team, ui.lineup, real.market, CONTRACT_LENGTH, real.completedRaces) : null;
  const ace = real ? aceChange(real.team, ui.lineup, real.market) : null;
  const blocked = plan?.blocked ?? ace?.blocked ?? null;
  const l = ui.lineup, room = bank(p, l), slot = ui.slot, isC = slot === 'CTOR';
  const cur = slot ? entity(p, isC ? l.ctor : slot) : undefined;
  const pool = slot ? swapPool(p, l, slot) : [];
  const proj = projectedLineup(p, l);
  const hindsight = [78, 64, 91, 55, 83];

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
  const top = slot ? topPickRec(p, l, slot) : null;

  return (
    <div className="page">
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
        <Tile label="Hindsight · last 5 rounds">
          {/* Fixed numbers, not this team's rounds. Hindsight needs the scored lineups, which
              nothing publishes yet. */}
          {!has.mock ? <Empty>Hindsight is not published yet. It needs what your lineup actually scored against the best possible one.</Empty> : <>
          <div className="bars" style={{ height: 56 }}>{hindsight.map((v, i) => <span key={i} className="hit" style={{ height: `${v}%` }} data-tip={`You scored ${v}% of the optimal lineup`} />)}</div>
          <span className="mut">Your score as a share of the best possible lineup. Ace calls cost you most: 2 of 5 correct.</span>
          <AsTable caption="Share of the optimal lineup scored per round" head={['Round', 'Share of optimal']} rows={hindsight.map((v, i) => [`RD ${p.round.number - 5 + i}`, `${v}%`])} />
          </>}
        </Tile>
      </div>
      <div className="c6" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {slot && cur ? (
          <>
            <Tile label={`Replace ${cur.name} · top pick`}>
              {top ? <Compare rec={top} /> : <span className="mut">Nothing affordable. Free budget elsewhere first.</span>}
              {!isC ? <button type="button" className="ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAce(cur.id)} disabled={l.ace === cur.id}>{l.ace === cur.id ? 'Ace is on this driver' : `Make ${cur.name} the ace`}</button> : null}
            </Tile>
            <Tile label={`All options within ${money(room)} bank · tap to swap`}>
              <div className="scroll"><table>
                <thead><tr><th scope="col">{isC ? 'Team' : 'Driver'}</th><th scope="col">Gain</th><th scope="col">Price</th><th scope="col">Proj</th><th scope="col">Pts/$100</th>{isC ? null : <>{has.fit ? <th scope="col">Fit</th> : null}<th scope="col">DNF</th><th scope="col">Next $</th></>}</tr></thead>
                <tbody>
                  <tr className="me"><td><TeamBar p={p} team={cur.team} /><b>{cur.name}</b> <span className="mut">now</span></td><td className="mut">—</td>{stat(cur)}</tr>
                  {pool.map(({ e, gain }, n) => (
                    <Tr key={e.id} onClick={() => swapInSlot(e.id)} label={`Swap in ${e.name}, ${gain > 0 ? 'plus' : 'minus'} ${Math.abs(gain).toFixed(0)} points`}>
                      <td><TeamBar p={p} team={e.team} /><b>{e.name}</b>{n === 0 && gain > 0 ? <> <Pill red>TOP</Pill></> : null}</td>
                      <td className={gain > 0 ? 'pos' : 'red'}><b>{gain > 0 ? '+' : ''}{gain.toFixed(0)}</b></td>{stat(e)}
                    </Tr>
                  ))}
                </tbody>
              </table></div>
            </Tile>
          </>
        ) : (
          <Tile label="Recommended moves">
            {swapRecs(p, l).length === 0 ? <span className="mut">Your lineup is the best available within budget.</span> : swapRecs(p, l).map((x) => { const o = entity(p, x.out)!, n = entity(p, x.in)!; return (
              <div key={`${x.out}${x.in}`} className="row" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span><span className="mut">{o.name} →</span> <b>{n.name}</b><br /><span className="mut">{x.cost >= 0 ? `Costs ${money(x.cost)}` : `Frees ${money(-x.cost)}`}{!isCtor(n) ? `${has.fit ? ` · circuit fit ${n.fit[0]}/5` : ''} · ${n.dprice > 0 ? 'price rising' : 'price flat'}` : ''}</span></span>
                <span className="pos num">+{x.gain.toFixed(0)}</span><button type="button" className="ghost" onClick={() => applyAct(`${x.out}:${x.in}`)}>Try</button>
              </div>
            ); })}
          </Tile>
        )}
      </div>
    </div>
  );
}
