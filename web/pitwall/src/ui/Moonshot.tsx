/**
 * Moonshot in the portal (F-109): the slide-over tab where a call is studied and placed, the
 * Briefing tile that follows it, the rivals' declarations and the Season record. Pricing is free;
 * the distribution behind a multiplier is the pass's.
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state';
import { useMoonshot } from '../lib/moonshotStore';
import { Locked } from './Locked';
import { AsTable, Empty, Lbl, Pill, Row } from './bits';
import {
  callOpen, chancePct, coveredPositions, currencyWord, declarationLine, distributionBars, liveChip, liveState, moonshotErrorText, multiplierLabel, outcomeLine, predictionLabel,
  predictionSentence, quoteFresh, sameTerms, settledLine, signed, stakeOptions, statsLines, type MoonshotMenu, type MoonshotQuote, type PredictionType, type StakeCurrency,
} from '../data/moonshot';

type Step = 'currency' | 'prediction' | 'stake' | 'confirm';

/**
 * Where a Moonshot can be called from: a real team, a round to price, not the example payload.
 * Returns the opener (driver id → slide-over on the MOONSHOT tab) or null when the entry points should not render.
 */
export function useMoonshotEntry(): ((driverId: string) => void) | null {
  const { payload: p, open, set, real } = useStore();
  const ms = useMoonshot();
  if (!ms || !ms.race || !real || p.example || !ms.ready) return null;
  // open() lands on PRESENT, so the tab is set after it
  return (id: string) => { open(id); set('overTab', 'MOONSHOT'); };
}

/** The slide-over's MOONSHOT tab: the predictions priced for this driver, the flow, and the depth view. */
export function MoonshotPanel({ driverId, driverName }: { driverId: string; driverName: string }) {
  const { payload: p } = useStore();
  const ms = useMoonshot();
  const [menu, setMenu] = useState<MoonshotMenu | 'loading' | null>('loading');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('currency');
  const [currency, setCurrency] = useState<StakeCurrency>('POINTS');
  const [prediction, setPrediction] = useState<PredictionType | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [stake, setStake] = useState<number | null>(null);
  const [quote, setQuote] = useState<MoonshotQuote | 'loading' | null>(null);
  const [busy, setBusy] = useState(false);
  const [termsChanged, setTermsChanged] = useState(false);
  const [done, setDone] = useState<'confirmed' | 'cancelled' | null>(null);

  useEffect(() => {
    let live = true;
    setMenu('loading'); setError(null); setStep('currency'); setPrediction(null); setTarget(null); setStake(null); setQuote(null); setDone(null); setTermsChanged(false);
    if (!ms || !ms.race || p.example) { setMenu(null); return; }
    ms.menu(driverId).then((m) => { if (live) setMenu(m); }).catch((e) => { if (live) { setMenu(null); setError(moonshotErrorText(e)); } });
    return () => { live = false; };
  }, [driverId, ms?.race?.raceId, p.example]); // eslint-disable-line react-hooks/exhaustive-deps -- a confirm or cancel ends on its own screen; the provider clears the menu cache for the next open

  if (p.example) return <Empty>Moonshots are placed from a real team. Sign in from the app to see this driver's predictions priced for the round.</Empty>;
  if (!ms || !ms.race) return <Empty>No round to price yet.</Empty>;
  if (menu === 'loading') return <Empty>Pricing…</Empty>;
  if (!menu) return <Empty>{error ?? 'Moonshots are not available.'}</Empty>;
  if (menu.availability === 'off') return <Empty>Moonshots are not available.</Empty>;
  if (menu.availability === 'locked') return <Empty>Moonshots unlock at midseason, from round {menu.unlockRound}: call one driver's result, risk points or cash, and a hit earns a multiplier.</Empty>;

  const chosen = menu.predictions.find((x) => x.type === prediction) ?? null;
  const exact = prediction === 'EXACT_FINISH' && target != null;
  const quoteFor = async (amount: number) => {
    if (!prediction) return null;
    setQuote('loading'); setError(null);
    try { const q = await ms.quote({ driverId, predictionType: prediction, predictionTarget: exact ? target! : undefined, stakeCurrency: currency, stakeAmount: amount }); setQuote(q); return q; }
    catch (e) { setQuote(null); setError(moonshotErrorText(e)); return null; }
  };
  const pickStake = async (amount: number) => { if (quote === 'loading') return; setStake(amount); setTermsChanged(false); if (await quoteFor(amount)) setStep('confirm'); };
  const doConfirm = async () => {
    if (!quote || quote === 'loading' || stake == null || busy) return;
    let q = quote;
    if (!quoteFresh(q, Date.now())) {
      const fresh = await quoteFor(stake);
      if (!fresh) { setStep('stake'); return; }
      if (!sameTerms(fresh, q)) { setTermsChanged(true); return; }   // the new numbers are on screen; confirm again
      q = fresh;
    }
    setBusy(true); setError(null);
    try { await ms.confirm(q.quoteId); setDone('confirmed'); } catch (e) { setError(moonshotErrorText(e)); } finally { setBusy(false); }
  };
  const doCancel = async () => {
    if (!menu.current || busy) return;
    setBusy(true); setError(null);
    try { await ms.cancel(menu.current.id); setDone('cancelled'); } catch (e) { setError(moonshotErrorText(e)); } finally { setBusy(false); }
  };
  const back = (to: Step) => <button type="button" className="ghost" onClick={() => { setStep(to); setStake(null); setQuote(null); setTermsChanged(false); setError(null); }}>Back</button>;
  const refusal = error ? <span className="red">{error}</span> : null;

  // the depth view: the distribution the multipliers are read from (pass)
  const dist = ms.model?.drivers[driverId] ?? null;
  const bars = distributionBars(dist);
  const covered = new Set(prediction ? coveredPositions(prediction, target) : []);
  const depth = (
    <div style={{ marginTop: 14 }}>
      <div className="th"><Lbl>Why this multiplier</Lbl>{ms.model ? <Pill>{ms.model.source}</Pill> : null}</div>
      <Locked feature="entity.moonshotModel">
        {bars.length ? (
          <>
            <div className="bars" aria-label={`${driverName}: chance of each finishing position`} role="img">
              {bars.map((b) => <span key={b.position} className={covered.has(b.position) ? 'hit' : undefined} style={{ height: `${b.height}%`, outline: b.predicted ? '1px dashed var(--red)' : undefined }} title={`P${b.position} · ${chancePct(b.share)}`} />)}
            </div>
            <span className="mut">Bars are the model's chance of each finish, P1 on the left; the dashed one is its predicted finish{menu.model ? ` (P${menu.model.predicted.toFixed(1)}, expected P${menu.model.expectedFinish.toFixed(1)}, likely P${menu.model.likelyLo}–P${menu.model.likelyHi})` : ''}. The chosen prediction's positions are filled. The multiplier follows the chance: the less likely, the bigger the reward.</span>
            <AsTable caption={`${driverName} finishing-position distribution`} head={['Position', 'Chance']} rows={bars.map((b) => [`P${b.position}`, chancePct(b.share)])} />
          </>
        ) : <Empty>No model is published for this round yet.</Empty>}
      </Locked>
    </div>
  );

  if (done === 'confirmed') return <><div className="th"><Lbl>Moonshot called</Lbl>{ms.tokens ? <Pill red>{ms.tokens.left} left</Pill> : null}</div><p className="est">{driverName} — {predictionLabel(prediction ?? 'WIN', target)} · {(stake ?? 0).toLocaleString()} {currencyWord(currency)} at risk. This Moonshot locks when race selections lock.</p>{depth}</>;
  if (done === 'cancelled') return <><div className="th"><Lbl>Moonshot cancelled</Lbl></div><p className="est">The token is back. Call again when you are ready.</p></>;

  if (menu.current) {
    const cur = menu.current;
    const open = callOpen(cur, Date.now()) && (menu.lockAtMs == null || menu.lockAtMs > Date.now());
    return (
      <>
        <div className="th"><Lbl>Your Moonshot this round</Lbl>{cur.result ? <Pill red={cur.result === 'HIT'}>{cur.result}</Pill> : <Pill>{open ? 'Open until lock' : 'Locked'}</Pill>}</div>
        <Row cols="1fr auto"><span>Prediction</span><b>{predictionLabel(cur.predictionType, cur.predictionTarget)}</b></Row>
        <Row cols="1fr auto"><span>Model chance</span><span className="num">{chancePct(cur.modelProbability)}</span></Row>
        <Row cols="1fr auto"><span>Reward</span><span className="num">{cur.rewardBand} {multiplierLabel(cur.multiplier)}</span></Row>
        <Row cols="1fr auto"><span>At risk</span><span className="num">{cur.stakeAmount.toLocaleString()} {currencyWord(cur.stakeCurrency)}</span></Row>
        <Row cols="1fr auto"><span>Hit · Miss</span><span className="num"><span className="red">{signed(cur.potentialReward)}</span> · {signed(-cur.stakeAmount)}</span></Row>
        {cur.result ? <p className="est">{settledLine(cur, driverName)}</p> : null}
        {!cur.result && open ? <div className="srow"><button type="button" className="ghost" onClick={doCancel} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel Moonshot'}</button><span className="mut">To change it, cancel and call again; the token comes back.</span></div> : null}
        {!cur.result && !open ? <span className="mut">Locked · no changes this weekend.</span> : null}
        {refusal}
        {depth}
      </>
    );
  }
  if (menu.tokensLeft <= 0) return <><Empty>No Moonshots left this season.</Empty>{depth}</>;
  if (!menu.modelAvailable || !menu.driverInModel) return <Empty>{menu.modelAvailable ? 'No model for this driver this round.' : 'No model is published for this round yet.'}</Empty>;

  const head = (
    <div className="th"><Lbl>Call a Moonshot</Lbl><Pill red>{menu.tokensLeft} left</Pill></div>
  );
  const doubleDown = menu.ownsDriver ? <p className="est"><b className="red">Double down.</b> {driverName} is already on your roster: a poor race already hurts your score.</p> : null;

  if (step === 'currency') return (
    <>
      {head}{doubleDown}
      <Lbl>What are you risking?</Lbl>
      <Row cols="1fr auto" onClick={() => { setCurrency('POINTS'); setStep('prediction'); }} label="Championship points"><span><b>🏆 Championship points</b><br /><span className="mut">Move up the standings.</span></span><span className="num">{menu.balances.POINTS.toLocaleString()}</span></Row>
      <Row cols="1fr auto" onClick={() => { setCurrency('CASH'); setStep('prediction'); }} label="Cash"><span><b>💰 Cash</b><br /><span className="mut">Build a stronger roster.</span></span><span className="num">${menu.balances.CASH.toLocaleString()}</span></Row>
      {depth}
    </>
  );
  if (step === 'prediction') return (
    <>
      {head}{doubleDown}
      <div className="th"><Lbl>Pick your challenge</Lbl><span className="mut">Harder predictions earn bigger rewards.</span></div>
      {[...menu.predictions].sort((a, b) => b.probability - a.probability).map((x) => (
        <Row key={x.type} cols="1fr auto" onClick={() => { setPrediction(x.type); setTarget(null); setStep('stake'); }} label={`${predictionLabel(x.type)}, model chance ${chancePct(x.probability)}, ${x.band} ${multiplierLabel(x.multiplier)}`}>
          <span><b>{predictionLabel(x.type)}</b><br /><span className="mut">{predictionSentence(x.type, driverName)} · model chance {chancePct(x.probability)}</span></span>
          <span className="num red">{x.band} {multiplierLabel(x.multiplier)}</span>
        </Row>
      ))}
      {menu.exactFinishEnabled && menu.positionsCount ? (
        <div><Lbl>Exact finish · up to {multiplierLabel(menu.maxMultiplier)}</Lbl><div className="srow" style={{ flexWrap: 'wrap', marginTop: 6 }}>{Array.from({ length: menu.positionsCount }, (_, k) => k + 1).map((pos) => (
          <button key={pos} type="button" className="chip" onClick={() => { setPrediction('EXACT_FINISH'); setTarget(pos); setStep('stake'); }}>P{pos}</button>
        ))}</div></div>
      ) : null}
      <div className="srow">{back('currency')}</div>
      {depth}
    </>
  );
  if (step === 'stake' && (chosen || exact)) return (
    <>
      {head}{doubleDown}
      <div className="th"><Lbl>Choose your risk</Lbl><span className="mut">{driverName} — {predictionLabel(prediction!, target)}{chosen ? ` · ${chancePct(chosen.probability)} · ${chosen.band} ${multiplierLabel(chosen.multiplier)}` : ''}</span></div>
      {stakeOptions(menu.stakes[currency]).map((s) => (
        <Row key={s.amount} cols="1fr auto" onClick={() => pickStake(s.amount)} selected={stake === s.amount} label={`${s.amount} ${currencyWord(currency)}${s.label ? `, ${s.label}` : ''}`}>
          <span><b>{s.amount.toLocaleString()} {currencyWord(currency)}</b>{s.label ? <><br /><span className="mut">{s.label}</span></> : null}</span>
          <span className="num">{quote === 'loading' && stake === s.amount ? '…' : ''}</span>
        </Row>
      ))}
      {refusal}
      <div className="srow">{back('prediction')}</div>
      {depth}
    </>
  );
  if (step === 'confirm' && stake != null) {
    if (quote === 'loading' || !quote) return <><Empty>Pricing…</Empty>{refusal}<div className="srow">{back('stake')}</div></>;
    return (
      <>
        <div className="th"><Lbl>Confirm Moonshot</Lbl></div>
        {doubleDown}
        <Row cols="1fr auto"><span>Driver</span><b>{driverName}</b></Row>
        <Row cols="1fr auto"><span>Prediction</span><b>{predictionLabel(prediction!, target)} · {ms.race.name}</b></Row>
        <Row cols="1fr auto"><span>Model chance</span><span className="num">{chancePct(quote.modelProbability)}</span></Row>
        <Row cols="1fr auto"><span>Reward</span><span className="num">{quote.rewardBand} {multiplierLabel(quote.multiplier)}</span></Row>
        <Row cols="1fr auto"><span>At risk</span><span className="num">{quote.stakeAmount.toLocaleString()} {currencyWord(currency)}</span></Row>
        <Row cols="1fr auto"><span>Hit · Miss</span><span className="num"><span className="red">{signed(quote.potentialReward)}</span> · {signed(-quote.stakeAmount)}</span></Row>
        <span className={termsChanged ? 'red' : 'mut'}>{termsChanged ? 'The terms changed · check them and confirm again.' : 'This Moonshot locks when race selections lock.'}</span>
        {refusal}
        <div className="srow">
          <button type="button" className="cta" onClick={doConfirm} disabled={busy}>{busy ? 'Confirming…' : `Confirm Moonshot · ${outcomeLine(quote.stakeAmount, quote.potentialReward)}`}</button>
          {back('stake')}
        </div>
        {depth}
      </>
    );
  }
  return <><Empty>{error ?? 'Something went wrong. Try again.'}</Empty><div className="srow">{back('currency')}</div></>;
}

/** The Briefing tile: your Moonshot this round, or how many you have left. Opens the driver's slide-over on the MOONSHOT tab. */
export function MoonshotTile() {
  const { payload: p } = useStore();
  const ms = useMoonshot();
  const openOn = useMoonshotEntry();
  if (!ms || !openOn) return null;
  const cur = ms.current;
  const name = (id: string) => p.drivers.find((d) => d.id === id)?.name ?? id;
  if (!cur) {
    return (
      <section className="tile only-wide" aria-label="Your Moonshot">
        <div className="th"><Lbl>🚀 Moonshot</Lbl><span className="mut">{ms.tokens ? `${ms.tokens.left} of ${ms.tokens.perTeam} left this season` : 'From midseason, three a season'}</span></div>
        <span className="mut">No call this round. Open any driver and pick the MOONSHOT tab to see the predictions priced.</span>
      </section>
    );
  }
  const open_ = callOpen(cur, Date.now());
  // a live pill only while the sweep is writing: the document persists after the race, so its age decides
  const fresh = !!ms.live && ms.live.atMs != null && Date.now() - ms.live.atMs < 15 * 60 * 1000;
  const pos = fresh ? ms.live!.byDriver[cur.driverId] ?? null : null;
  const state = fresh ? liveState(cur, pos) : null;
  return (
    <section className="tile only-wide you" aria-label="Your Moonshot">
      <div className="th"><Lbl>🚀 Your Moonshot</Lbl>{cur.result ? <Pill red={cur.result === 'HIT'}>{cur.result}</Pill> : state ? <Pill red={state === 'IN' || state === 'CLOSE'}>{pos ? `P${pos} · ` : ''}{liveChip(state)}</Pill> : <Pill>{open_ ? 'Open until lock' : 'Locked'}</Pill>}</div>
      <Row cols="1fr auto" onClick={() => openOn(cur.driverId)} label={`${name(cur.driverId)} ${predictionLabel(cur.predictionType, cur.predictionTarget)}, open detail`}>
        <span><b>{name(cur.driverId)} — {predictionLabel(cur.predictionType, cur.predictionTarget)}</b><br /><span className="mut">{cur.result ? settledLine(cur, name(cur.driverId)) : `${chancePct(cur.modelProbability)} · ${cur.rewardBand} ${multiplierLabel(cur.multiplier)} · ${cur.stakeAmount.toLocaleString()} ${currencyWord(cur.stakeCurrency)} at risk`}</span></span>
        <span className="num"><span className="red">{signed(cur.potentialReward)}</span> · {signed(-cur.stakeAmount)}</span>
      </Row>
      <span className="mut">{open_ ? 'Cancel from the driver’s MOONSHOT tab before lock; the token comes back.' : cur.result ? '' : 'Locked · no changes this weekend.'}</span>
    </section>
  );
}

/** The rivals' declarations (SPEC §16): what league-mates have locked in this round. */
export function MoonshotRivals() {
  const { payload: p } = useStore();
  const ms = useMoonshot();
  if (!ms || p.example) return null;
  const rivals = ms.board.filter((b) => !ms.current || b.id !== ms.current.id);
  if (rivals.length === 0) return null;
  const name = (id: string) => p.drivers.find((d) => d.id === id)?.name ?? id;
  return (
    <div style={{ marginTop: 8 }}>
      <Lbl>🚀 Moonshots called</Lbl>
      {rivals.map((b) => <div key={b.id}><span>{declarationLine(b, name(b.driverId))}</span>{b.result ? <> <Pill red={b.result === 'HIT'}>{b.result}</Pill></> : null}</div>)}
    </div>
  );
}

/** The Season page's record (SPEC §28/§30): what this team has risked and won. */
export function MoonshotSeason() {
  const { payload: p, real } = useStore();
  const lines = statsLines(real?.team.moonshotStats, (id) => p.drivers.find((d) => d.id === id)?.name ?? id);
  if (!real || p.example) return null;
  return (
    <section className="tile c4" aria-label="Your Moonshots this season">
      <div className="th"><Lbl>🚀 Moonshots · this season</Lbl>{typeof real.team.moonshotPoints === 'number' && real.team.moonshotPoints !== 0 ? <Pill red={real.team.moonshotPoints > 0}>{signed(real.team.moonshotPoints)} pts</Pill> : null}</div>
      {lines.length === 0 ? <Empty>No Moonshot called yet. From midseason, every driver carries three predictions priced by the model.</Empty> : (
        <div className="list">{lines.map(([k, v]) => <Row key={k} cols="1fr auto"><span>{k}</span><span className="num">{v}</span></Row>)}</div>
      )}
    </section>
  );
}
