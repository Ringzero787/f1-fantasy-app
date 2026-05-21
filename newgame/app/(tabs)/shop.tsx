import { useEffect } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@store/auth.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { useShopStore } from '@store/shop.store';
import { useGarageStore } from '@store/garage.store';
import { garageService, garageConfig } from '@services/garage.service';
import {
  DriverPortrait,
  TierChip,
  TierMultBadge,
  Num,
  SectionLabel,
  Cash,
} from '@components/tl';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import type { Driver, Constructor } from '@/types';

export default function ShopScreen() {
  const t = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const { garage, refetch: refetchGarage } = useGarageWithEntities();
  const offerDrivers = useShopStore((s) => s.drivers);
  const offerConstructors = useShopStore((s) => s.constructors);
  const offerLoading = useShopStore((s) => s.isLoading);
  const hasInitialOffer = useShopStore((s) => s.hasInitialOffer);
  const rollFresh = useShopStore((s) => s.rollFresh);
  const refreshGarageStore = useGarageStore((s) => s.refresh);

  useEffect(() => {
    if (garage && !hasInitialOffer && !offerLoading) {
      rollFresh({ excludeDriverIds: garage.ownedDriverIds, excludeConstructorIds: garage.ownedConstructorIds });
    }
  }, [garage, hasInitialOffer, offerLoading, rollFresh]);

  const onReroll = async () => {
    if (!userId || !garage) return;
    if (garage.cash < garageConfig.REROLL_BASE_COST) {
      Alert.alert('Not enough cash', `Reroll costs $${garageConfig.REROLL_BASE_COST}.`);
      return;
    }
    try {
      await garageService.chargeReroll(userId);
      await refreshGarageStore(userId);
      await rollFresh({ excludeDriverIds: garage.ownedDriverIds, excludeConstructorIds: garage.ownedConstructorIds });
    } catch (err) {
      Alert.alert('Reroll failed', err instanceof Error ? err.message : 'Unknown');
    }
  };

  const onBuyDriver = async (driver: Driver) => {
    if (!userId || !garage) return;
    if (garage.cash < driver.price) {
      Alert.alert('Not enough cash', `${driver.name} costs $${driver.price}.`);
      return;
    }
    const rosterFull = (garage.rosteredDriverIds?.length ?? 0) >= (garage.rosterDriverSlots ?? 4);
    const subtitle = rosterFull
      ? `$${driver.price} — adds to your bench (active roster is full)`
      : `$${driver.price} — auto-deploys to active roster`;
    Alert.alert(`Buy ${driver.name}?`, subtitle, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          try {
            await garageService.buyDriver(userId, driver);
            await refreshGarageStore(userId);
            refetchGarage();
            const refreshed = useGarageStore.getState().garage;
            await rollFresh({
              excludeDriverIds: refreshed?.ownedDriverIds ?? [...garage.ownedDriverIds, driver.id],
              excludeConstructorIds: refreshed?.ownedConstructorIds ?? garage.ownedConstructorIds,
            });
          } catch (err) {
            Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown');
          }
        },
      },
    ]);
  };

  const onBuyConstructor = async (c: Constructor) => {
    if (!userId || !garage) return;
    if (garage.cash < c.price) {
      Alert.alert('Not enough cash', `${c.name} costs $${c.price}.`);
      return;
    }
    const rosterFull = (garage.rosteredConstructorIds?.length ?? 0) >= (garage.rosterConstructorSlots ?? 2);
    const subtitle = rosterFull
      ? `$${c.price} — adds to your bench (active roster is full)`
      : `$${c.price} — auto-deploys to active roster`;
    Alert.alert(`Buy ${c.name}?`, subtitle, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Buy',
        onPress: async () => {
          try {
            await garageService.buyConstructor(userId, c);
            await refreshGarageStore(userId);
            refetchGarage();
            const refreshed = useGarageStore.getState().garage;
            await rollFresh({
              excludeDriverIds: refreshed?.ownedDriverIds ?? garage.ownedDriverIds,
              excludeConstructorIds: refreshed?.ownedConstructorIds ?? [...garage.ownedConstructorIds, c.id],
            });
          } catch (err) {
            Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown');
          }
        },
      },
    ]);
  };

  if (!garage) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ padding: 20, paddingTop: 4, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <View>
            <Text
              style={{
                fontFamily: t.fMono,
                fontSize: 11,
                color: t.textMute,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              Bankroll
            </Text>
            <Cash amount={garage.cash} size={36} accent />
          </View>
          <Pressable
            onPress={onReroll}
            disabled={offerLoading}
            style={({ pressed }) => [
              {
                height: 56,
                paddingHorizontal: 18,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.accentDim,
                backgroundColor: t.accentSoft,
                alignItems: 'flex-end',
                justifyContent: 'center',
                opacity: offerLoading ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: t.accent, opacity: 0.7 }}>
              ${garageConfig.REROLL_BASE_COST}
            </Text>
            <Text style={{ fontFamily: t.fSans, fontSize: 14, fontWeight: '600', color: t.accent, marginTop: 2 }}>
              Reroll ↻
            </Text>
          </Pressable>
        </View>

        <View style={{ height: 4 }} />

        <SectionLabel trailing={`${offerDrivers.length} OFFERED`}>Drivers</SectionLabel>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {offerDrivers.length === 0 && !offerLoading ? (
            <Text style={{ fontFamily: t.fMono, fontSize: 12, color: t.textMute, textAlign: 'center', padding: 20 }}>No drivers in shop.</Text>
          ) : (
            offerDrivers.map((d) => (
              <ShopDriverCard key={d.id} driver={d} cash={garage.cash} onBuy={() => onBuyDriver(d)} />
            ))
          )}
        </View>

        <View style={{ height: 22 }} />

        <SectionLabel trailing={`${offerConstructors.length} OFFERED`}>Constructors</SectionLabel>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {offerConstructors.length === 0 && !offerLoading ? (
            <Text style={{ fontFamily: t.fMono, fontSize: 12, color: t.textMute, textAlign: 'center', padding: 20 }}>No constructors in shop.</Text>
          ) : (
            offerConstructors.map((c) => (
              <ShopConstructorCard key={c.id} constructor={c} cash={garage.cash} onBuy={() => onBuyConstructor(c)} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ShopDriverCard({ driver, cash, onBuy }: { driver: Driver; cash: number; onBuy: () => void }) {
  const t = useTheme();
  const teamShort = (driver.constructorName || '').slice(0, 3).toUpperCase();
  const teamColor = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || t.accent;
  const canAfford = cash >= driver.price;
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 14,
        padding: 17,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        opacity: canAfford ? 1 : 0.55,
      }}
    >
      <DriverPortrait driver={driver} size={62} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 18, color: t.text, letterSpacing: -0.3 }}>{driver.name}</Text>
          <TierChip tier={driver.tier} />
          <TierMultBadge tier={driver.tier} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 13, color: teamColor, fontWeight: '600' }}>{teamShort}</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 13, color: t.textDim, opacity: 0.5 }}>·</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 13, color: t.textDim }}>{driver.fantasyPoints} pts</Text>
        </View>
      </View>
      <Pressable
        disabled={!canAfford}
        onPress={onBuy}
        style={({ pressed }) => [
          {
            height: 52,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: canAfford ? t.accent : t.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: canAfford ? '#0E1116' : t.textMute,
            fontFamily: t.fMono,
            fontSize: 16,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}
        >
          ${driver.price}
        </Text>
        <Text style={{ color: canAfford ? '#0E1116' : t.textMute, fontFamily: t.fMono, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 1, opacity: 0.7 }}>
          BUY
        </Text>
      </Pressable>
    </View>
  );
}

function ShopConstructorCard({ constructor, cash, onBuy }: { constructor: Constructor; cash: number; onBuy: () => void }) {
  const t = useTheme();
  const color = (CONSTRUCTOR_COLORS as Record<string, string>)[constructor.shortName] || constructor.primaryColor || t.accent;
  const canAfford = cash >= constructor.price;
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 14,
        padding: 17,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        opacity: canAfford ? 1 : 0.55,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: color }} />
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 18, color: t.text, letterSpacing: -0.3 }}>{constructor.name}</Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 13, color: t.textDim, marginTop: 3 }}>{constructor.fantasyPoints} pts</Text>
      </View>
      <Pressable
        disabled={!canAfford}
        onPress={onBuy}
        style={({ pressed }) => [
          {
            height: 52,
            paddingHorizontal: 16,
            borderRadius: 12,
            backgroundColor: canAfford ? t.accent : t.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: canAfford ? '#0E1116' : t.textMute,
            fontFamily: t.fMono,
            fontSize: 16,
            fontWeight: '700',
          }}
        >
          ${constructor.price}
        </Text>
        <Text style={{ color: canAfford ? '#0E1116' : t.textMute, fontFamily: t.fMono, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 1, opacity: 0.7 }}>
          BUY
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
