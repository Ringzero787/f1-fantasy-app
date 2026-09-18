import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { teamAccent } from '../theme/simpleTheme';
import { useRaceScoresStore } from '../../store/raceScores.store';
import { useAdminStore } from '../../store/admin.store';
import { PRICING_CONFIG } from '../../config/pricing.config';
import { ColorBar, MonoLabel, PillButton } from './GridBits';
import { constructorShortName } from './entityNames';
import { tileDetail, type DetailEntry } from './tileDetail';

export interface SheetTarget {
  kind: 'driver' | 'constructor';
  entry: DetailEntry;
  constructorId: string;
  teamLabel: string;      // constructor short name (driver) or "CONSTRUCTOR"
  number?: string;        // car number
  isAce: boolean;
}

interface Props {
  target: SheetTarget | null;
  onClose: () => void;
  /** omit all three for a read-only (member) view */
  locked?: boolean;
  aceLocked?: boolean;
  /** resolve false when the action failed (the sheet then stays open) */
  onToggleAce?: (t: SheetTarget) => Promise<boolean | void> | boolean | void;
  onRemove?: (t: SheetTarget) => Promise<boolean | void> | boolean | void;
}

// Tap a tile → stats, Ace and Remove without leaving the Team screen.
export function GridTileSheet({ target, onClose, locked, aceLocked, onToggleAce, onRemove }: Props) {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const lastRaceScores = useRaceScoresStore((s) => s.lastRaceScores);
  const prevRaceScores = useRaceScoresStore((s) => s.prevRaceScores);
  const entityHistory = useRaceScoresStore((s) => s.entityHistory);
  const fetchEntityHistory = useRaceScoresStore((s) => s.fetchEntityHistory);
  const driverPrices = useAdminStore((s) => s.driverPrices);
  const constructorPrices = useAdminStore((s) => s.constructorPrices);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'ace' | 'remove' | null>(null);
  const id = target?.entry.id ?? null;

  useEffect(() => { setConfirming(false); setBusy(null); }, [id]);
  // Fetch on open when there is nothing cached — including an empty result,
  // which is also what a transient failure leaves behind.
  useEffect(() => {
    if (id && !(useRaceScoresStore.getState().entityHistory[id]?.length)) fetchEntityHistory(id);
  }, [id, fetchEntityHistory]);

  const d = useMemo(() => {
    if (!target) return null;
    const market = (target.kind === 'driver' ? driverPrices : constructorPrices)[target.entry.id]?.currentPrice;
    return tileDetail(target.entry, {
      marketPrice: market,
      last: lastRaceScores[target.entry.id] ?? null,
      prev: prevRaceScores[target.entry.id] ?? null,
      history: entityHistory[target.entry.id],
      defaultContract: PRICING_CONFIG.CONTRACT_LENGTH,
      aceMaxPrice: PRICING_CONFIG.ACE_MAX_PRICE,
    });
  }, [target, driverPrices, constructorPrices, lastRaceScores, prevRaceScores, entityHistory]);

  if (!target || !d) return null;

  const readOnly = !onRemove && !onToggleAce;
  const trendColor = d.trend.trend === 'up' ? colors.positive : d.trend.trend === 'down' ? colors.primary : colors.text.muted;
  const historyLoading = !entityHistory[target.entry.id];
  const maxForm = Math.max(1, ...d.form.map((f) => Math.abs(f.points)));

  const stat = (label: string, value: string, sub?: string, subColor?: string) => (
    <View style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, paddingHorizontal: 12, gap: 6, minWidth: scaled(96) }}>
      <MonoLabel size={10} style={{ letterSpacing: scaled(10) * 0.14 }}>{label}</MonoLabel>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(20), lineHeight: scaled(22), letterSpacing: -scaled(20) * 0.04, color: colors.text.primary }}>{value}</Text>
      {sub ? <Text style={[mono(10), { color: subColor ?? colors.text.muted }]}>{sub}</Text> : null}
    </View>
  );

  const run = async (kind: 'ace' | 'remove', fn?: (t: SheetTarget) => Promise<boolean | void> | boolean | void) => {
    if (!fn || busy) return;
    setBusy(kind);
    try {
      const ok = (await fn(target)) !== false;
      if (kind === 'remove' && ok) onClose();   // a failed remove keeps the sheet (and its alert) in context
    } finally { setBusy(null); setConfirming(false); }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}} accessible={false} style={{ maxHeight: '88%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }} showsVerticalScrollIndicator={false}>
            {/* identity */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <MonoLabel color={target.kind === 'constructor' ? colors.primary : undefined}>{target.kind === 'constructor' ? 'TEAM' : `DRIVER · ${target.number ?? ''}`}</MonoLabel>
              <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><MonoLabel color={colors.text.muted}>CLOSE</MonoLabel></Pressable>
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(26), lineHeight: scaled(28), letterSpacing: -scaled(26) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{target.entry.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ColorBar color={teamAccent(target.constructorId)} width={scaled(28)} />
              <Text style={[mono(11), { color: colors.text.muted, textTransform: 'uppercase' }]}>{target.teamLabel}</Text>
              {target.isAce ? <MonoLabel size={10} color={colors.primary}>· ACE 2×</MonoLabel> : null}
              {target.entry.isReservePick ? <MonoLabel size={10} color={colors.primary}>· AUTO-FILLED</MonoLabel> : null}
            </View>

            {/* stats */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {stat('FOR YOUR TEAM', String(d.seasonPoints), d.perRace != null ? `${d.perRace} / RACE` : 'NOT RACED YET')}
              {stat('LAST RACE', d.lastRace ? `${d.lastRace.total >= 0 ? '+' : ''}${d.lastRace.total}` : '—', `${d.trend.glyph} VS RACE BEFORE`, trendColor)}
              {stat('PRICE', `$${d.price}`, d.priceDelta === 0 ? `PAID $${d.paid}` : `${d.priceDelta > 0 ? '▲' : '▼'} $${Math.abs(d.priceDelta)} · PAID $${d.paid}`, d.priceDelta > 0 ? colors.positive : d.priceDelta < 0 ? colors.primary : undefined)}
            </View>

            {/* contract */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight }}>
              <MonoLabel>CONTRACT</MonoLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {d.contract.dots.map((dot, i) => <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot === 'on' ? colors.text.primary : dot === 'last' ? colors.primary : colors.borderStrong }} />)}
                </View>
                <Text style={[mono(11), { color: d.contract.critical ? colors.primary : colors.text.primary }]}>{d.contract.left} OF {d.contract.length} RACES LEFT</Text>
              </View>
            </View>

            {/* last race breakdown */}
            {d.lastRace && d.lastRace.parts.length > 0 ? (
              <View style={{ gap: 8 }}>
                <MonoLabel>LAST RACE BREAKDOWN</MonoLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 8 }}>
                  {d.lastRace.parts.map((p) => (
                    <View key={p.label} style={{ gap: 2 }}>
                      <MonoLabel size={10} style={{ letterSpacing: scaled(10) * 0.14 }}>{p.label}</MonoLabel>
                      <Text style={mono(14)}>{p.value}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* recent form */}
            <View style={{ gap: 8 }}>
              <MonoLabel>RECENT FORM</MonoLabel>
              {historyLoading ? <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} /> : d.form.length === 0 ? (
                <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>NO SCORED RACES YET.</Text>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: scaled(64) }}>
                  {d.form.map((f) => (
                    <View key={f.round} style={{ flex: 1, alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      <Text style={[mono(10), { color: f.points < 0 ? colors.primary : colors.text.primary }]}>{f.points}</Text>
                      <View style={{ width: '100%', height: Math.max(3, Math.round((Math.abs(f.points) / maxForm) * scaled(30))), borderRadius: 3, backgroundColor: f.points < 0 ? colors.primary : colors.text.primary }} />
                      <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>R{f.round}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* actions */}
            {readOnly ? null : confirming ? (
              <View style={{ gap: 10, marginTop: 4 }}>
                <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><MonoLabel>SALE PRICE</MonoLabel><Text style={mono(13)}>${d.sale.marketPrice}</Text></View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><MonoLabel color={d.sale.fee > 0 ? colors.primary : undefined}>EARLY TERMINATION</MonoLabel><Text style={[mono(13), { color: d.sale.fee > 0 ? colors.primary : colors.text.muted }]}>{d.sale.fee > 0 ? `−$${d.sale.fee}` : 'NO FEE'}</Text></View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><MonoLabel color={colors.text.primary}>YOU RECEIVE</MonoLabel><Text style={[mono(15), { color: colors.positive }]}>+${d.sale.saleReturn}</Text></View>
                </View>
                <PillButton label={busy === 'remove' ? 'REMOVING…' : `CONFIRM · REMOVE ${target.entry.name.toUpperCase()}`} variant="primary" disabled={!!busy} onPress={() => run('remove', onRemove)} />
                <Pressable onPress={() => setConfirming(false)} disabled={!!busy} accessibilityRole="button" accessibilityLabel="Keep" style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.text.muted}>KEEP</MonoLabel></Pressable>
              </View>
            ) : (
              <View style={{ gap: 10, marginTop: 4 }}>
                {onToggleAce ? (
                  <PillButton
                    label={busy === 'ace' ? 'SAVING…' : aceLocked ? 'ACE LOCKED FOR THIS ROUND' : target.isAce ? 'CLEAR ACE' : d.aceEligible ? 'MAKE ACE · 2× POINTS' : `ACE NEEDS A PRICE OF $${PRICING_CONFIG.ACE_MAX_PRICE} OR LESS`}
                    variant={aceLocked || (!target.isAce && !d.aceEligible) ? 'muted' : 'inverse'}
                    disabled={!!busy || !!aceLocked || (!target.isAce && !d.aceEligible)}
                    onPress={() => run('ace', onToggleAce)}
                  />
                ) : null}
                {onRemove ? (
                  <PillButton label={locked ? 'LOCKED · NO CHANGES THIS WEEKEND' : 'REMOVE FROM TEAM'} variant={locked ? 'muted' : 'outline'} disabled={!!locked || !!busy} onPress={() => setConfirming(true)} />
                ) : null}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Build a sheet target from a roster entry. */
export function sheetTargetFor(
  kind: 'driver' | 'constructor',
  e: { driverId?: string; constructorId: string; name: string; purchasePrice: number; currentPrice: number; pointsScored?: number; racesHeld?: number; contractLength?: number; isReservePick?: boolean },
  opts: { number?: string; isAce: boolean },
): SheetTarget {
  const id = kind === 'driver' ? (e.driverId as string) : e.constructorId;
  return {
    kind,
    entry: { id, name: kind === 'constructor' ? constructorShortName(e.constructorId, e.name) : e.name, purchasePrice: e.purchasePrice, currentPrice: e.currentPrice, pointsScored: e.pointsScored, racesHeld: e.racesHeld, contractLength: e.contractLength, isReservePick: e.isReservePick },
    constructorId: e.constructorId,
    teamLabel: kind === 'constructor' ? 'CONSTRUCTOR' : constructorShortName(e.constructorId),
    number: opts.number,
    isAce: opts.isAce,
  };
}
