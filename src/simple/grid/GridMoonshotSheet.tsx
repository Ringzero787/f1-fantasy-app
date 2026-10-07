import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel, PillButton } from './GridBits';
import { useMoonshotStore } from '../../store/moonshot.store';
import {
  callOpen, chancePct, copyText, currencyWord, multiplierLabel, outcomeLine, predictionLabel, predictionSentence,
  quoteFresh, settledLine, signed, stakeOptions, type MoonshotClientConfig, type PredictionType, type StakeCurrency,
} from './moonshot';

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
  /** after a confirm or cancel, so the caller reloads the season's calls */
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
  const [done, setDone] = useState<'confirmed' | 'cancelled' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const key = target ? `${target.teamId}:${target.raceId}:${target.driverId}` : null;

  useEffect(() => {
    setStep('currency'); setPrediction(null); setStake(null); setWhy(false); setDone(null); clearError();
    if (target) openMenu(target.teamId, target.raceId, target.driverId); else closeMenu();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15 * 1000);
    return () => clearInterval(id);
  }, []);

  const c = cfg;
  const copy = useMemo<Pick<MoonshotClientConfig, 'copy'>>(() => ({ copy: { ...c.copy, ...(menu?.copy ?? {}) } }), [c.copy, menu?.copy]);
  const chosen = menu?.predictions.find((p) => p.type === prediction) ?? null;
  const stakes = menu ? stakeOptions(menu.stakes[currency], copy) : [];

  if (!target) return null;

  const title = (s: string) => <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(24), letterSpacing: -scaled(22) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{s}</Text>;
  const sub = (s: string, color: string = colors.text.muted) => <Text style={[mono(11, 'medium'), { color }]}>{s}</Text>;
  const row = (label: string, value: string, accent?: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <MonoLabel color={accent ? colors.text.primary : undefined}>{label}</MonoLabel>
      <Text style={[mono(13), { color: accent ? colors.primary : colors.text.primary }]}>{value}</Text>
    </View>
  );
  const choice = (label: string, detail: string, right: string | null, onPress: () => void, selected = false) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${detail}${right ? `, ${right}` : ''}`}
      style={({ pressed }) => ({ backgroundColor: selected ? colors.text.primary : colors.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontFamily: family.ui.black, fontSize: scaled(14), letterSpacing: scaled(14) * 0.04, color: selected ? colors.text.inverse : colors.text.primary }}>{label}</Text>
        <Text style={[mono(11, 'medium'), { color: selected ? colors.text.inverse : colors.text.muted }]}>{detail}</Text>
      </View>
      {right ? <Text style={[mono(16), { color: selected ? colors.text.inverse : colors.primary }]}>{right}</Text> : null}
    </Pressable>
  );
  const back = (to: Step) => (
    <Pressable onPress={() => { setStep(to); clearQuote(); clearError(); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ alignItems: 'center', paddingVertical: 8 }}>
      <MonoLabel color={colors.text.muted}>BACK</MonoLabel>
    </Pressable>
  );

  const pickStake = async (amount: number) => {
    if (!menu || !prediction) return;
    setStake(amount);
    const q = await requestQuote({ teamId: target.teamId, raceId: target.raceId, driverId: target.driverId, predictionType: prediction, stakeCurrency: currency, stakeAmount: amount });
    if (q) setStep('confirm');
  };
  const doConfirm = async () => {
    if (!quote || !prediction || stake == null) return;
    // a quote past its expiry is re-fetched, never confirmed stale
    let q = quote;
    if (!quoteFresh(q, Date.now())) {
      const fresh = await requestQuote({ teamId: target.teamId, raceId: target.raceId, driverId: target.driverId, predictionType: prediction, stakeCurrency: currency, stakeAmount: stake });
      if (!fresh) return;
      q = fresh;
    }
    if (await confirm(q.quoteId)) { setDone('confirmed'); onChanged?.(); }
  };
  const doCancel = async () => {
    if (!menu?.current) return;
    if (await cancel(menu.current.id)) { setDone('cancelled'); onChanged?.(); }
  };

  const body = () => {
    if (loadingMenu || !menu) return <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} />;
    if (done === 'confirmed') return (
      <View style={{ gap: 12 }}>
        {title('MOONSHOT CALLED')}
        {quote || chosen ? sub(`${target.driverName.toUpperCase()} — ${predictionLabel(prediction ?? 'WIN')} · ${stake} ${currencyWord(currency)} ${copyText(copy, 'atRisk')}`, colors.text.primary) : null}
        {sub(copyText(copy, 'confirmLockNote'))}
        <PillButton label="DONE" variant="inverse" onPress={onClose} />
      </View>
    );
    if (done === 'cancelled') return (
      <View style={{ gap: 12 }}>
        {title(copyText(copy, 'cancelled'))}
        <PillButton label="DONE" variant="inverse" onPress={onClose} />
      </View>
    );
    if (menu.availability === 'off') return sub('Moonshots are not available.');
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
      return (
        <View style={{ gap: 12 }}>
          {title(copyText(copy, 'alreadyCalled'))}
          <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
            {row('DRIVER', target.driverId === cur.driverId ? target.driverName.toUpperCase() : cur.driverId.toUpperCase(), true)}
            {row('PREDICTION', predictionLabel(cur.predictionType, cur.predictionTarget))}
            {row(copyText(copy, 'modelChance'), chancePct(cur.modelProbability))}
            {row(copyText(copy, 'reward'), `${cur.rewardBand} ${multiplierLabel(cur.multiplier)}`)}
            {row(copyText(copy, 'atRisk'), `${cur.stakeAmount.toLocaleString()} ${currencyWord(cur.stakeCurrency)}`)}
            {row(copyText(copy, 'hit'), signed(cur.potentialReward), true)}
            {row(copyText(copy, 'miss'), signed(-cur.stakeAmount))}
          </View>
          {settled ? sub(settledLine(cur, target.driverId === cur.driverId ? target.driverName : cur.driverId, copy), cur.result === 'HIT' ? colors.positive : colors.text.primary)
            : open ? (
              <PillButton label={busy === 'cancel' ? 'CANCELLING…' : copyText(copy, 'cancelCall')} variant="outline" disabled={!!busy} onPress={doCancel} />
            ) : sub(copyText(copy, 'lockedCall'))}
          {open ? sub('To change it, cancel and call again; the token comes back.') : null}
        </View>
      );
    }
    if (menu.tokensLeft <= 0) return <View style={{ gap: 8 }}>{title(copyText(copy, 'tokensNone'))}</View>;
    if (!menu.modelAvailable || !menu.driverInModel) return sub(!menu.modelAvailable ? 'No model is published for this race yet.' : 'No model for this driver this race.');

    const header = (
      <View style={{ gap: 4 }}>
        <MonoLabel color={colors.primary}>{copyText(copy, 'callTitle')} · {copyText(copy, 'tokensLeft', { n: menu.tokensLeft, s: menu.tokensLeft === 1 ? '' : 'S' })}</MonoLabel>
        {menu.ownsDriver ? (
          <View style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 14, padding: 12, gap: 4, marginTop: 6 }}>
            <MonoLabel color={colors.primary}>🔥 {copyText(copy, 'doubleDownTitle')}</MonoLabel>
            {sub(copyText(copy, 'doubleDownBody', { driver: target.driverName }), colors.text.primary)}
          </View>
        ) : null}
        {menu.carriedFrom ? sub(copyText(copy, 'carriedFrom', { race: menu.carriedFrom.replace(/_\d{4}$/, '').replace(/_/g, ' ').toUpperCase() })) : null}
      </View>
    );

    if (step === 'currency') return (
      <View style={{ gap: 12 }}>
        {header}
        {title(copyText(copy, 'currencyTitle'))}
        {choice(`🏆 ${copyText(copy, 'currencyPoints')}`, copyText(copy, 'currencyPointsSub'), `${menu.balances.POINTS.toLocaleString()}`, () => { setCurrency('POINTS'); setStep('prediction'); })}
        {choice(`💰 ${copyText(copy, 'currencyCash')}`, copyText(copy, 'currencyCashSub'), `$${menu.balances.CASH.toLocaleString()}`, () => { setCurrency('CASH'); setStep('prediction'); })}
      </View>
    );
    if (step === 'prediction') return (
      <View style={{ gap: 12 }}>
        {header}
        {title(copyText(copy, 'predictionTitle'))}
        {sub(copyText(copy, 'predictionSub'))}
        {[...menu.predictions].sort((a, b) => b.probability - a.probability).map((p) =>
          choice(predictionLabel(p.type), `${predictionSentence(p.type, target.driverName)} · ${copyText(copy, 'modelChance').toLowerCase()} ${chancePct(p.probability)}`, `${p.band} ${multiplierLabel(p.multiplier)}`, () => { setPrediction(p.type); setStep('stake'); }),
        )}
        <Pressable onPress={() => setWhy((w) => !w)} hitSlop={8} accessibilityRole="button" style={{ paddingVertical: 4 }}>
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
    if (step === 'stake' && chosen) return (
      <View style={{ gap: 12 }}>
        {header}
        {title(copyText(copy, 'stakeTitle'))}
        {sub(`${target.driverName.toUpperCase()} — ${predictionLabel(chosen.type)} · ${copyText(copy, 'modelChance')} ${chancePct(chosen.probability)} · ${chosen.band} ${multiplierLabel(chosen.multiplier)}`, colors.text.primary)}
        {stakes.map((s) => choice(`${s.amount.toLocaleString()} ${currencyWord(currency)}`, s.label, loadingQuote && stake === s.amount ? '…' : null, () => pickStake(s.amount), stake === s.amount))}
        {error ? sub(error, colors.primary) : null}
        {back('prediction')}
      </View>
    );
    if (step === 'confirm' && quote && chosen && stake != null) return (
      <View style={{ gap: 12 }}>
        {title(copyText(copy, 'confirmTitle'))}
        <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
          {row('DRIVER', target.driverName.toUpperCase(), true)}
          {row('PREDICTION', `${predictionLabel(chosen.type)} · ${target.raceName.toUpperCase()}`)}
          {row(copyText(copy, 'modelChance'), chancePct(quote.modelProbability))}
          {row(copyText(copy, 'reward'), `${quote.rewardBand} ${multiplierLabel(quote.multiplier)}`)}
          {row(copyText(copy, 'atRisk'), `${quote.stakeAmount.toLocaleString()} ${currencyWord(currency)}`)}
          {row(copyText(copy, 'hit'), signed(quote.potentialReward), true)}
          {row(copyText(copy, 'miss'), signed(-quote.stakeAmount))}
        </View>
        {sub(copyText(copy, 'confirmLockNote'))}
        {error ? sub(error, colors.primary) : null}
        <PillButton label={busy === 'confirm' || loadingQuote ? 'CONFIRMING…' : `${copyText(copy, 'confirmButton')} · ${outcomeLine(quote.stakeAmount, quote.potentialReward, copy)}`} variant="primary" disabled={!!busy || loadingQuote} onPress={doConfirm} />
        <Pressable onPress={onClose} disabled={!!busy} accessibilityRole="button" accessibilityLabel={copyText(copy, 'cancelButton')} style={{ alignItems: 'center', paddingVertical: 8 }}>
          <MonoLabel color={colors.text.muted}>{copyText(copy, 'cancelButton')}</MonoLabel>
        </Pressable>
        {back('stake')}
      </View>
    );
    return sub(error ?? 'Something went wrong. Try again.', colors.primary);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}} accessible={false} style={{ maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <MonoLabel color={colors.primary}>🚀 {copyText(copy, 'tabTitle')} · {target.raceName.toUpperCase()}</MonoLabel>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><MonoLabel color={colors.text.muted}>CLOSE</MonoLabel></Pressable>
            </View>
            {menu && !menu.current && done == null && menu.availability === 'open' && menu.tokensLeft > 0 ? (
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(26), lineHeight: scaled(28), letterSpacing: -scaled(26) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{target.driverName}</Text>
            ) : null}
            {error && step === 'currency' && !loadingMenu && !menu ? sub(error, colors.primary) : null}
            {body()}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
