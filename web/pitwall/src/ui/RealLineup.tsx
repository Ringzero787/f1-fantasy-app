import { OPEN_SEAT, money, shortName, shortTeamName } from '../data/logic';
import { ACE_MAX_PRICE, TEAM_SIZE, type Plan } from '../data/team';
import { useStore } from '../state';
import { Pill, TeamBar } from './bits';
import { useMoonshot } from '../lib/moonshotStore';

/** The user's real roster as tiles: names, prices and contracts from the team document. */
export function RealRoster() {
  const { payload: p, ui, real, toggleSlot, setAce } = useStore();
  const moonshotDriver = useMoonshot()?.current?.driverId ?? null;
  if (!real) return null;
  const { team, market } = real;
  const byId = new Map(team.drivers.map((d) => [d.driverId, d]));
  const slots = [...ui.lineup.drivers];
  while (slots.length < TEAM_SIZE) slots.push('');
  const teamOf = (constructorId: string) => p.teams[constructorId]?.id ?? constructorId;
  return (
    <div className="lineup">
      {slots.map((id, i) => {
        // an empty seat opens the same picker as a filled one, and the save plan adds the pick
        if (!id) return <button key={`open-${i}`} type="button" className="dt" style={{ borderStyle: 'dashed', borderColor: 'var(--borderS)' }} aria-pressed={ui.slot === OPEN_SEAT} aria-label="Open seat. Show who could fill it" onClick={() => toggleSlot(OPEN_SEAT)}><span className="mut">OPEN SEAT</span><span className="mut">Tap to fill</span></button>;
        const own = byId.get(id); const m = market.drivers[id];
        const name = shortName(own?.name ?? m?.name ?? id); const price = m?.price ?? own?.currentPrice ?? 0; const ace = id === ui.lineup.ace;
        const left = own ? Math.max(0, (own.contractLength ?? 3) - (own.racesHeld ?? 0)) : null;
        // The ACE pill sits on the tile as in the app: filled on the ace (tap to clear), outlined on a
        // pick that may be the ace (tap to set), absent over the cap. It is a sibling of the tile
        // button, drawn over its corner, because a button may not contain a button.
        const canAce = price <= ACE_MAX_PRICE;
        return (
          <span key={id} className="dtw">
          <button type="button" className="dt" aria-pressed={ui.slot === id} aria-label={`${name}, ${money(price)}${ace ? ', ace' : ''}${own ? '' : ', new'}. Show swaps`} onClick={() => toggleSlot(id)}>
            <span style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: ace || canAce ? 62 : 0 }} className="mut">
              <span>{own ? '' : <Pill red>NEW</Pill>}{id === moonshotDriver ? <Pill red>🚀</Pill> : null}</span><span className="num">{money(price)}</span>
            </span>
            <span><span className="nm">{name}</span>
              <span style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span><TeamBar p={p} team={teamOf(own?.constructorId ?? '')} /></span>
                <span className="num mut">{left === null ? 'new contract' : `${left} race${left === 1 ? '' : 's'} left`}</span></span></span>
          </button>
          {ace || canAce ? (
            <button type="button" className="chip acepill" aria-pressed={ace} aria-label={ace ? `${name} is the ace. Tap to clear` : `Make ${name} the ace`} title={ace ? 'Ace · 2× points · tap to clear' : `Make ${name} the ace`} onClick={() => setAce(id)}>{ace ? 'ACE 2×' : 'ACE'}</button>
          ) : null}
          </span>
        );
      })}
      {(() => {
        const cid = ui.lineup.ctor; const own = team.constructor && team.constructor.constructorId === cid ? team.constructor : null; const m = market.constructors[cid];
        if (!cid) return <button type="button" className="dt ctor" style={{ borderStyle: 'dashed', borderColor: 'var(--borderS)' }} aria-pressed={ui.slot === 'CTOR'} aria-label="No constructor. Show who could fill the seat" onClick={() => toggleSlot('CTOR')}><span className="red">TEAM</span><span className="mut">No constructor · tap to fill</span></button>;
        const left = own ? Math.max(0, (own.contractLength ?? 3) - (own.racesHeld ?? 0)) : null;
        return (
          <button type="button" className="dt ctor" aria-pressed={ui.slot === 'CTOR'} aria-label={`${m?.name ?? cid}, constructor. Show swaps`} onClick={() => toggleSlot('CTOR')}>
            <span style={{ display: 'flex', justifyContent: 'space-between' }} className="mut"><span><span className="red">TEAM</span>{own ? '' : <> <Pill red>NEW</Pill></>}</span><span className="num">{money(m?.price ?? own?.currentPrice ?? 0)}</span></span>
            <span><span className="nm">{shortTeamName(m?.name ?? own?.name ?? cid, cid)}</span><span style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}><span><TeamBar p={p} team={teamOf(cid)} /></span><span className="num mut">{left === null ? 'new contract' : `${left} race${left === 1 ? '' : 's'} left`}</span></span></span>
          </button>
        );
      })()}
    </div>
  );
}

/** Before anything is written: every sale with its fee, every purchase, and the bank afterwards. */
export function SavePreview({ plan, aceTo, onCancel, onConfirm }: { plan: Plan; aceTo: string | null; onCancel: () => void; onConfirm: () => void }) {
  const { real } = useStore();
  const aceName = aceTo ? real?.market.drivers[aceTo]?.name ?? aceTo : null;
  return (
    <div className="cmp" role="dialog" aria-label="Confirm lineup save">
      <span className="lbl">Save lineup</span>
      {plan.steps.map((s, i) => (
        <div key={i} className="cmpr" style={{ gridTemplateColumns: '1fr auto' }}>
          <span><b>{s.op === 'sellDriver' ? `Sell ${s.name}` : s.op === 'removeConstructor' ? `Drop ${s.name}` : s.op === 'setConstructor' ? `Add ${s.name} (team)` : `Add ${s.name}`}</b>
            {'fee' in s && s.fee > 0 ? <><br /><span className="red">Early termination −{money(s.fee)}</span></> : null}
            {'contractLength' in s ? <><br /><span className="mut">{s.contractLength} race contract</span></> : null}</span>
          <span className={`num ${'returns' in s ? 'pos' : ''}`}>{'returns' in s ? `+${money(s.returns)}` : `−${money(s.cost)}`}</span>
        </div>
      ))}
      {aceTo !== null ? <div className="cmpr" style={{ gridTemplateColumns: '1fr auto' }}><span><b>{aceTo ? `Ace on ${aceName}` : 'Clear the ace'}</b></span><span className="mut">2× points</span></div> : null}
      <div className="cmpr" style={{ gridTemplateColumns: '1fr auto' }}><span className="lbl">Bank after</span><span className="num">{money(plan.bankAfter)}</span></div>
      <p className="mut" style={{ margin: 0, fontSize: 11 }}>Fees and prices shown are estimates that match the server's rules; the server has the final say and stops at the first step it refuses.</p>
      <div className="th" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="cta" onClick={onConfirm}>Confirm</button>
        <button type="button" className="ghost" onClick={onCancel}>Back</button>
      </div>
    </div>
  );
}
