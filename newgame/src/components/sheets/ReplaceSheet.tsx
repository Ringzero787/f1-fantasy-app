// ReplaceSheet — bottom sheet invoked from Garage. Release current driver/constructor
// AND immediately pick a replacement from the shop. Shows budget after release and
// the net cash impact (refund − cost).

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { TierChip, TierMultBadge, DriverPortrait, Num } from '@components/tl';
import { useShopStore } from '@store/shop.store';
import { useGarageStore } from '@store/garage.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { garageService, garageConfig } from '@services/garage.service';
import type { Driver, Constructor } from '@/types';

type Kind = 'driver' | 'constructor';

export function ReplaceSheet({
  visible,
  onClose,
  kind,
  releasing,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  kind: Kind;
  releasing: Driver | Constructor;
  userId: string;
}) {
  const t = useTheme();
  const { garage } = useGarageWithEntities();
  const offerDrivers = useShopStore((s) => s.drivers);
  const offerConstructors = useShopStore((s) => s.constructors);
  const offerLoading = useShopStore((s) => s.isLoading);
  const hasLoaded = useShopStore((s) => s.hasLoaded);
  const loadCatalog = useShopStore((s) => s.loadCatalog);
  const refreshGarage = useGarageStore((s) => s.refresh);

  const [picked, setPicked] = useState<Driver | Constructor | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible && garage && !hasLoaded && !offerLoading) {
      loadCatalog({ excludeDriverIds: garage.ownedDriverIds, excludeConstructorIds: garage.ownedConstructorIds });
    }
  }, [visible, garage, hasLoaded, offerLoading, loadCatalog]);

  if (!garage) return null;

  const refund = Math.round(releasing.price * garageConfig.RELEASE_REFUND_PCT);
  const budget = garage.cash + refund;
  const cap = kind === 'driver' ? 'driver' : 'constructor';
  const teamShort = kind === 'driver' ? (releasing as Driver).constructorName?.slice(0, 3).toUpperCase() : (releasing as Constructor).shortName;
  const teamColor = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort || ''] || (releasing as Constructor).primaryColor || t.accent;

  const offers: (Driver | Constructor)[] = kind === 'driver'
    ? (offerDrivers as Driver[]).filter((d) => d.price <= budget)
    : (offerConstructors as Constructor[]).filter((c) => c.price <= budget);

  const swap = async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      // Release first (refund), then buy replacement
      if (kind === 'driver') {
        await garageService.releaseDriver(userId, releasing.id);
        await garageService.buyDriver(userId, picked as Driver);
      } else {
        await garageService.releaseConstructor(userId, releasing.id);
        await garageService.buyConstructor(userId, picked as Constructor);
      }
      await refreshGarage(userId);
      // Re-roll the shop with the new owned set
      const updatedGarage = await import('@services/garage.service').then((m) => m.garageService.getGarage(userId));
      if (updatedGarage) {
        await loadCatalog({
          excludeDriverIds: updatedGarage.ownedDriverIds,
          excludeConstructorIds: updatedGarage.ownedConstructorIds,
        });
      }
      onClose();
    } catch (err) {
      Alert.alert('Swap failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setSubmitting(false);
    }
  };

  const cost = picked?.price || 0;
  const netCash = refund - cost;
  const netSign = netCash >= 0 ? '+' : '−';
  const netColor = netCash >= 0 ? t.success : t.danger;

  return (
    <Sheet visible={visible} onClose={onClose} title={`Pick a ${cap} for ${releasing.name}'s seat`} subtitle="Release refunds 75% of price. Replacement cost subtracts from your budget.">
      {/* Releasing summary */}
      <View
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 12,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <View style={{ width: 4, alignSelf: 'stretch', minHeight: 36, borderRadius: 2, backgroundColor: teamColor }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              color: t.danger,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              fontWeight: '700',
            }}
          >
            Releasing
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontFamily: t.fDisp,
              fontWeight: '600',
              fontSize: 15,
              color: t.text,
              letterSpacing: -0.3,
            }}
          >
            {releasing.name}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              color: t.textMute,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Refund
          </Text>
          <Text style={{ fontFamily: t.fMono, fontWeight: '700', fontSize: 15, color: t.success }}>+${refund}</Text>
        </View>
      </View>

      {/* Budget */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 12,
          paddingHorizontal: 4,
        }}
      >
        <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.4 }}>Budget after release</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
        <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '700', color: t.text }}>${budget}</Text>
      </View>

      {/* Candidates */}
      <View style={{ gap: 8, marginBottom: 14 }}>
        {offers.length === 0 && !offerLoading ? (
          <View
            style={{
              padding: 20,
              borderRadius: 12,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: t.line,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim, textAlign: 'center', lineHeight: 16 }}>
              Nothing in the shop fits your budget. Reroll from the Shop tab to refresh.
            </Text>
          </View>
        ) : null}
        {offers.map((o) => {
          const isPicked = picked?.id === o.id;
          return (
            <CandidateRow
              key={o.id}
              kind={kind}
              item={o}
              picked={isPicked}
              onPick={() => setPicked(o)}
            />
          );
        })}
      </View>

      {/* Confirm bar */}
      <View
        style={{
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          {picked ? (
            <>
              <Text
                style={{
                  fontFamily: t.fMono,
                  fontSize: 10,
                  color: t.textMute,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  fontWeight: '600',
                }}
              >
                Net to bankroll
              </Text>
              <Text style={{ fontFamily: t.fMono, fontWeight: '700', fontSize: 18, color: netColor, letterSpacing: 0.3 }}>
                {netSign}${Math.abs(netCash)}
              </Text>
            </>
          ) : (
            <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim, letterSpacing: 0.3 }}>
              Pick a replacement above
            </Text>
          )}
        </View>
        <Pressable
          onPress={swap}
          disabled={!picked || submitting}
          style={({ pressed }) => [
            {
              height: 46,
              paddingHorizontal: 18,
              borderRadius: 10,
              backgroundColor: picked ? t.accent : 'transparent',
              borderWidth: picked ? 0 : 1,
              borderColor: t.line,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: submitting ? 0.5 : pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: picked ? '#0E1116' : t.textMute,
              fontFamily: t.fMono,
              fontWeight: '800',
              fontSize: 12,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {submitting ? 'Swapping…' : 'Swap →'}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function CandidateRow({
  kind,
  item,
  picked,
  onPick,
}: {
  kind: Kind;
  item: Driver | Constructor;
  picked: boolean;
  onPick: () => void;
}) {
  const t = useTheme();
  const teamShort = kind === 'driver' ? (item as Driver).constructorName?.slice(0, 3).toUpperCase() : (item as Constructor).shortName;
  const teamColor = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort || ''] || (item as Constructor).primaryColor || t.accent;
  const tier = kind === 'driver' ? (item as Driver).tier : 'B'; // constructors don't have tier in our model
  return (
    <Pressable
      onPress={onPick}
      style={({ pressed }) => [
        {
          backgroundColor: picked ? t.accentSoft : t.surface,
          borderWidth: picked ? 1.5 : 1,
          borderColor: picked ? t.accent : t.line,
          borderRadius: 12,
          padding: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {kind === 'driver' ? (
        <DriverPortrait driver={item as Driver} size={42} />
      ) : (
        <View style={{ width: 4, alignSelf: 'stretch', minHeight: 38, borderRadius: 2, backgroundColor: teamColor }} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 14, color: t.text, letterSpacing: -0.3 }} numberOfLines={1}>
            {item.name}
          </Text>
          <TierChip tier={tier as 'A' | 'B' | 'C'} />
          {kind === 'driver' ? <TierMultBadge tier={(item as Driver).tier} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 1 }}>
          {kind === 'driver' ? (
            <>
              <Text style={{ fontFamily: t.fMono, fontSize: 10, color: teamColor, fontWeight: '600' }}>{teamShort}</Text>
              <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, opacity: 0.5 }}>·</Text>
            </>
          ) : null}
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim }}>{item.fantasyPoints} pts</Text>
        </View>
      </View>
      <Num size={14} weight="700" color={picked ? t.accent : t.text}>
        ${item.price}
      </Num>
    </Pressable>
  );
}
