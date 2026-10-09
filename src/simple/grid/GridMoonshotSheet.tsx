import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel, PillButton } from './GridBits';
import { useMoonshotStore } from '../../store/moonshot.store';
import { track } from '../../services/analytics.service';
import {
  callOpen, chancePct, copyText, currencyWord, multiplierLabel, outcomeLine, predictionLabel, predictionSentence,
  quoteFresh, sameTerms, settledLine, signed, stakeOptions, type MoonshotClientConfig, type PredictionType, type StakeCurrency,
} from './moonshot';
import { shortRaceName } from './raceLeaderboard';

export interface MoonshotTarget {
  teamId: string;
  raceId: string;
  raceName: string;
  driverId: string;
  driverName: string;
}

interface Props {
  target: MoonshotTarget | null;
  cfg: MoonshotClientConfig;
  onClose: () => void;
  /** after a confirm or cancel, so the caller reloads the team's calls */
  onChanged?: () => void;
}

type Step = 'currency' | 'prediction' | 'stake' | 'confirm';

/**
 * The Moonshot flow (F-108): currency → prediction → stake → confirm, three choices and a
 * confirmation, never one tap. Every chance, multiplier and reward on screen is the server's:
 * the menu prices the predictions, the quote prices the stake, confirm takes the quote by id.
 */
export function GridMoonshotSheet({ target, cfg, onClose, onChanged }: Props) {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const { menu, loadingMenu, quote, loadingQuote, busy, error, openMenu, closeMenu, requestQuote, clearQuote, confirm, cancel, clearError } = useMoonshotStore();
  const [step, setStep] = useState<Step>('currency');
  const [currency, setCurrency] = useState<StakeCurrency>('POINTS');
  const [prediction, setPrediction] = useState<PredictionType | null>(null);
  const [stake, setStake] = useState<number | null>(null);
  const [why, setWhy] = useState(false);
  const [termsChanged, setTermsChanged] = useState(false);
  const [target_, setTargetPos] = useState<number | null>(null);   // EXACT FINISH position, when enabled
  const openTutorial = useMoonshotStore((s) => s.openTutorial);
  const [done, setDone] = useState<'confirmed' | 'cancelled' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const confirming = useRef(false);   // one confirm in flight, whatever the render closure says
  const key = target ? `${target.teamId}:${target.raceId}:${target.driverId}` : null;

  useEffect(() => {
    setStep('currency'); setPrediction(null); setStake(null); setWhy(false); setTermsChanged(false); setDone(null); setTargetPos(null);
    if (target) { openMenu(target.teamId, target.raceId, target.driverId); track('moonshot_opened', { driverId: target.driverId, raceId: target.raceId }); } else closeMenu();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(id);
  }, []);

  const copy = useMemo<Pick<MoonshotClientConfig, 'copy'>>(() => ({ copy: { ...cfg.copy, ...(menu?.copy ?? {}) } }), [cfg.copy, menu?.copy]);
  const chosen = menu?.predictions.find((p) => p.type === prediction) ?? null;
  const stakes = menu ? stakeOptions(menu.stakes[currency], copy) : [];

  if (!target) return null;

  const title = (s: string) => <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{s}</Text>;
  const sub = (s: string, color: string = colors.text.muted) => <Text style={[mono(11, 'medium'), { color }]}>{s}</Text>;
  const refusal = () => (error ? sub(error, colors.primary) : null);
  const row = (label: string, value: string, accent?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <MonoLabel color={accent ? colors.text.primary : undefined}>{label}</MonoLabel>
      <Text style={[mono(13), { color: accent ? colors.primary : colors.text.primary }]}>{value}</Text>
    </View>
  );
  const choice = (id: string, label: string, detail: string, right: string | null, onPress: () => void, selected = false) => (
    <Pressable key={id} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${detail}${right ? `, ${right}` : ''}`}
      style={({ pressed }) => ({ backgroundColor: selected ? colors.text.primary : colors.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: family.ui.black, fontSize: scaled(14), letterSpacing: scaled(14) * 0.04, color: selected ? colors.text.inverse : colors.text.primary }}>{label}</Text>
        <Text style={[mono(11, 'medium'), { color: selected ? colors.text.inverse : colors.text.muted }]}>{detail}</Text>
      </View>
      {right ? <Text style={[mono(16), { color: selected ? colors.text.inverse : colors.primary }]}>{right}</Text> : null}
    </Pressable>
  );
  const back = (to: Step) => (
    <Pressable onPress={() => { setStep(to); setStake(null); setTermsChanged(false); clearQuote(); clearError(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel={copyText(copy, 'back')} style={{ alignItems: 'center', paddingVertical: 8 }}>
      <MonoLabel color={colors.text.muted}>{copyText(copy, 'back')}</MonoLabel>
    </Pressable>
  );
  const doubleDown = menu?.ownsDriver ? (
    <View style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 14, padding: 12, gap: 4 }}>
      <MonoLabel color={colors.primary}>🔥 {copyText(copy, 'doubleDownTitle')}</MonoLabel>
      {sub(copyText(copy, 'doubleDownBody', { driver: target.driverName }), colors.text.primary)}
    </View>
  ) : null;

  const quoteFor = (amount: number) => requestQuote({ teamId: target.teamId, raceId: target.raceId, driverId: target.driverId, predictionType: prediction!, predictionTarget: prediction === 'EXACT_FINISH' ? target_ ?? undefined : undefined, stakeCurrency: currency, stakeAmount: amount });

  const pickStake = async (amount: number) => {
    if (!menu || !prediction || loadingQuote) return;   // one quote in flight at a time
    setStake(amount); setTermsChanged(false);
    track('moonshot_stake_selected', { stakeCurrency: currency, stakeAmount: amount });
    const q = await quoteFor(amount);
    if (q) { setStep('confirm'); track('moonshot_quote_viewed', { predictionType: prediction, multiplier: q.multiplier, modelProbability: q.modelProbability }); }
  };
  const doConfirm = async () => {
    if (!quote || !prediction || stake == null || busy || loadingQuote || confirming.current) return;
    confirming.current = true;
    try { await confirmNow(quote); } finally { confirming.current = false; }
  };
  const confirmNow = async (quote0: NonNullable<typeof quote>) => {
    if (!prediction || stake == null) return;
    let q = quote0;
    if (!quoteFresh(q, Date.now())) {
      // past its expiry: re-fetch, and only go on if the player is still confirming the same terms
      const fresh = await quoteFor(stake);
      if (!fresh) { setStep('stake'); return; }
      if (!sameTerms(fresh, q)) { setTermsChanged(true); return; }   // the new numbers are on screen now; confirm again
      q = fresh;
    }
    setTermsChanged(false);
    if (await confirm(q.quoteId)) { setDone('confirmed'); onChanged?.(); track('moonshot_confirmed', { predictionType: prediction, stakeCurrency: currency, stakeAmount: stake, multiplier: q.multiplier }); }
  };
  const doCancel = async () => {
    if (!menu?.current || busy) return;
    if (await cancel(menu.current.id)) { setDone('cancelled'); onChanged?.(); track('moonshot_cancelled', { raceId: target.raceId }); }
  };

  const body = () => {
    if (loadingMenu) return <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />;
    if (!menu) return sub(error ?? copyText(copy, 'genericError'), colors.primary);
    if (done === 'confirmed') return (
      <View style={{ gap: 12 }}>
        {title(copyText(copy, 'called'))}
        {sub(`${target.driverName.toUpperCase()} — ${predictionLabel(prediction ?? 'WIN')} · ${(stake ?? 0).toLocaleString()} ${currencyWord(currency)} ${copyText(copy, 'atRisk')}`, colors.text.primary)}
        {sub(copyText(copy, 'confirmLockNote'))}
        <PillButton label={copyText(copy, 'done')} variant="inverse" onPress={onClose} />
      </View>
    );
    if (done === 'cancelled') return (
      <View style={{ gap: 12 }}>
        {title(copyText(copy, 'cancelled'))}
        <PillButton label={copyText(copy, 'done')} variant="inverse" onPress={onClose} />
      </View>
    );
    if (menu.availability === 'off') return sub(copyText(copy, 'notAvailable'));
    if (menu.availability === 'locked') return (
      <View style={{ gap: 8 }}>
        {title(copyText(copy, 'lockedTitle'))}
        {sub(copyText(copy, 'lockedBody', { round: menu.unlockRound }))}
      </View>
    );
    // the call already made on this race, instead of a new one
    if (menu.current) {
      const cur = menu.current;
      const open = callOpen(cur, now) && (menu.lockAtMs == null || menu.lockAtMs > now);
      const settled = cur.result != null;
      const name = target.driverId === cur.driverId ? target.driverName : cur.driverId;
      return (
        <View style={{ gap: 12 }}>
          {title(copyText(copy, 'alreadyCalled'))}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
            {row('DRIVER', name.toUpperCase(), true)}
            {row('PREDICTION', predictionLabel(cur.predictionType, cur.predictionTarget))}
            {row(copyText(copy, 'modelChance'), chancePct(cur.modelProbability))}
            {row(copyText(copy, 'reward'), `${cur.rewardBand} ${multiplierLabel(cur.multiplier)}`)}
            {row(copyText(copy, 'atRisk'), `${cur.stakeAmount.toLocaleString()} ${currencyWord(cur.stakeCurrency)}`)}
            {row(copyText(copy, 'hit'), signed(cur.potentialReward), true)}
            {row(copyText(copy, 'miss'), signed(-cur.stakeAmount))}
          </View>
          {settled ? sub(settledLine(cur, name, copy), cur.result === 'HIT' ? colors.positive : colors.text.primary)
            : open ? <PillButton label={busy === 'cancel' ? 'CANCELLING…' : copyText(copy, 'cancelCall')} variant="outline" disabled={!!busy} onPress={doCancel} />
            : sub(copyText(copy, 'lockedCall'))}
          {refusal()}
          {open ? sub(copyText(copy, 'changeHint')) : null}
        </View>
      );
    }
    if (menu.tokensLeft <= 0) return title(copyText(copy, 'tokensNone'));
    if (!menu.modelAvailable || !menu.driverInModel) return sub(copyText(copy, menu.modelAvailable ? 'noModelDriver' : 'noModel'));

    const header = (
      <View style={{ gap: 6 }}>
        <MonoLabel color={colors.primary}>{copyText(copy, 'callTitle')} · {copyText(copy, 'tokensLeft', { n: menu.tokensLeft, s: menu.tokensLeft === 1 ? '' : 'S' })}</MonoLabel>
        {doubleDown}
        {menu.carriedFrom ? sub(copyText(copy, 'carriedFrom', { race: menu.carriedFrom.replace(/_\d{4}$/, '').replace(/_/g, ' ').toUpperCase() })) : null}
      </View>
    );

    if (step === 'currency') return (
      <View style={{ gap: 12 }}>
        {header}
        {title(copyText(copy, 'currencyTitle'))}
        {choice('POINTS', `🏆 ${copyText(copy, 'currencyPoints')}`, copyText(copy, 'currencyPointsSub'), `${menu.balances.POINTS.toLocaleString()} ${currencyWord('POINTS')}`, () => { setCurrency('POINTS'); setStep('prediction'); track('moonshot_currency_selected', { stakeCurrency: 'POINTS' }); })}
        {choice('CASH', `💰 ${copyText(copy, 'currencyCash')}`, copyText(copy, 'currencyCashSub'), `$${menu.balances.CASH.toLocaleString()} ${currencyWord('CASH')}`, () => { setCurrency('CASH'); setStep('prediction'); track('moonshot_currency_selected', { stakeCurrency: 'CASH' }); })}
      </View>
    );
    if (step === 'prediction') return (
      <View style={{ gap: 12 }}>
        {header}
        {title(copyText(copy, 'predictionTitle'))}
        {sub(copyText(copy, 'predictionSub'))}
        {[...menu.predictions].sort((a, b) => b.probability - a.probability).map((p) =>
          choice(p.type, predictionLabel(p.type), `${predictionSentence(p.type, target.driverName)} · ${copyText(copy, 'modelChance').toLowerCase()} ${chancePct(p.probability)}`, `${p.band} ${multiplierLabel(p.multiplier)}`, () => { setPrediction(p.type); setStake(null); setStep('stake'); track('moonshot_prediction_selected', { predictionType: p.type, modelProbability: p.probability }); }),
        )}
        {menu.exactFinishEnabled && menu.positionsCount ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(14), letterSpacing: scaled(14) * 0.04, color: colors.text.primary }}>{predictionLabel('EXACT_FINISH')}</Text>
              <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>CHOOSE A POSITION · UP TO {multiplierLabel(menu.maxMultiplier ?? cfg.maxMultiplier)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {Array.from({ length: menu.positionsCount }, (_, k) => k + 1).map((pos) => (
                <Pressable key={pos} onPress={() => { setPrediction('EXACT_FINISH'); setTargetPos(pos); setStake(null); setStep('stake'); track('moonshot_prediction_selected', { predictionType: 'EXACT_FINISH', predictionTarget: pos }); }} accessibilityRole="button" accessibilityLabel={`Finish P${pos}`}
                  style={({ pressed }) => ({ width: scaled(40), paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.borderStrong, opacity: pressed ? 0.7 : 1 })}>
                  <Text style={mono(12)}>P{pos}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
        <Pressable onPress={() => { setWhy((w) => !w); if (!why) track('moonshot_model_details_viewed', { driverId: target.driverId }); }} hitSlop={8} accessibilityRole="button" style={{ paddingVertical: 4 }}>
          <MonoLabel color={colors.text.muted}>{copyText(copy, 'whyMultiplier')}</MonoLabel>
        </Pressable>
        {why && menu.model ? (
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
            {row('MODEL PREDICTED FINISH', `P${menu.model.predicted.toFixed(1)}`)}
            {row('EXPECTED FINISH', `P${menu.model.expectedFinish.toFixed(1)}`)}
            {row('LIKELY RANGE', `P${menu.model.likelyLo}–P${menu.model.likelyHi}`)}
            {sub('The multiplier follows the model chance: the less likely the result, the bigger the reward.')}
          </View>
        ) : null}
        {back('currency')}
      </View>
    );
    const exact = prediction === 'EXACT_FINISH' && target_ != null;
    if (step === 'stake' && (chosen || exact)) return (
      <View style={{ gap: 12 }}>
        {header}
        {title(copyText(copy, 'stakeTitle'))}
        {sub(chosen ? `${target.driverName.toUpperCase()} — ${predictionLabel(chosen.type)} · ${copyText(copy, 'modelChance')} ${chancePct(chosen.probability)} · ${chosen.band} ${multiplierLabel(chosen.multiplier)}` : `${target.driverName.toUpperCase()} — ${predictionLabel('EXACT_FINISH', target_)} · the quote prices this position`, colors.text.primary)}
        {stakes.map((s) => choice(String(s.amount), `${s.amount.toLocaleString()} ${currencyWord(currency)}`, s.label, loadingQuote && stake === s.amount ? '…' : null, () => pickStake(s.amount), stake === s.amount))}
        {refusal()}
        {back('prediction')}
      </View>
    );
    if (step === 'confirm' && (chosen || exact) && stake != null) {
      if (loadingQuote || !quote) return <View style={{ gap: 12 }}><ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />{refusal()}{back('stake')}</View>;
      return (
        <View style={{ gap: 12 }}>
          {title(copyText(copy, 'confirmTitle'))}
          {doubleDown}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
            {row('DRIVER', target.driverName.toUpperCase(), true)}
            {row('PREDICTION', `${predictionLabel(prediction ?? 'WIN', target_)} · ${shortRaceName(target.raceName).toUpperCase()}`)}
            {row(copyText(copy, 'modelChance'), chancePct(quote.modelProbability))}
            {row(copyText(copy, 'reward'), `${quote.rewardBand} ${multiplierLabel(quote.multiplier)}`)}
            {row(copyText(copy, 'atRisk'), `${quote.stakeAmount.toLocaleString()} ${currencyWord(currency)}`)}
            {row(copyText(copy, 'hit'), signed(quote.potentialReward), true)}
            {row(copyText(copy, 'miss'), signed(-quote.stakeAmount))}
          </View>
          {termsChanged ? sub(copyText(copy, 'quoteChanged'), colors.primary) : sub(copyText(copy, 'confirmLockNote'))}
          {refusal()}
          <PillButton label={busy === 'confirm' ? 'CONFIRMING…' : `${copyText(copy, 'confirmButton')} · ${outcomeLine(quote.stakeAmount, quote.potentialReward, copy)}`} variant="primary" disabled={!!busy} onPress={doConfirm} />
          <Pressable onPress={onClose} disabled={!!busy} accessibilityRole="button" accessibilityLabel={copyText(copy, 'cancelButton')} style={{ alignItems: 'center', paddingVertical: 8 }}>
            <MonoLabel color={colors.text.muted}>{copyText(copy, 'cancelButton')}</MonoLabel>
          </Pressable>
          {back('stake')}
        </View>
      );
    }
    return <View style={{ gap: 12 }}>{sub(error ?? copyText(copy, 'genericError'), colors.primary)}{back('currency')}</View>;
  };

  const showName = menu && !menu.current && done == null && menu.availability === 'open' && menu.tokensLeft > 0;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* scrim behind the sheet, not around it: nested Pressables stop the list scrolling on iOS (F-119) */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={{ maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* the title gives way, never the buttons: on a long race name it wraps instead of pushing CLOSE off the edge */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <MonoLabel color={colors.primary} numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>🚀 {copyText(copy, 'tabTitle')} · {shortRaceName(target.raceName).toUpperCase()}</MonoLabel>
              <View style={{ flexDirection: 'row', gap: 16, flexShrink: 0 }}>
                <Pressable onPress={() => { openTutorial(); track('moonshot_tutorial_viewed', { from: 'info' }); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="How Moonshots work"><MonoLabel color={colors.text.muted}>ⓘ HOW IT WORKS</MonoLabel></Pressable>
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><MonoLabel color={colors.text.muted}>CLOSE</MonoLabel></Pressable>
              </View>
            </View>
            {showName ? (
              // no adjustsFontSizeToFit: this mounts once the menu has loaded, and on iOS the fit then shrinks the name to a few points
              <Text numberOfLines={2} style={{ fontFamily: family.ui.black, fontSize: scaled(26), lineHeight: scaled(28), letterSpacing: -scaled(26) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{target.driverName}</Text>
            ) : null}
            {body()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
