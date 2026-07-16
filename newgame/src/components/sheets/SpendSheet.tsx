// SpendSheet — bottom sheet for adding to the garage from the shop.
// In our data model, "bench" = drivers we own that aren't in current race lineup
// (effectively all owned drivers — no separate bench yet). Shop = freshly rolled offers.

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { TierChip, TierMultBadge, DriverPortrait, Num } from '@components/tl';
import { useShopStore } from '@store/shop.store';
import { useGarageStore } from '@store/garage.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { garageService } from '@services/garage.service';
import type { Driver, Constructor } from '@/types';

type SpendKind = 'driver' | 'constructor';

export function SpendSheet({
  visible,
  onClose,
  kind,
  userId,
}: {
  visible: boolean;
  onClose: () => void;
  kind: SpendKind;
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

  // Load the catalog on first open
  useEffect(() => {
    if (visible && garage && !hasLoaded && !offerLoading) {
      loadCatalog({ excludeDriverIds: garage.ownedDriverIds, excludeConstructorIds: garage.ownedConstructorIds });
    }
  }, [visible, garage, hasLoaded, offerLoading, loadCatalog]);

  if (!garage) return null;
  const cap = kind === 'driver' ? 'driver' : 'constructor';

  const onBuyDriver = async (driver: Driver) => {
    if (garage.cash < driver.price) {
      Alert.alert('Not enough cash', `${driver.name} costs $${driver.price}.`);
      return;
    }
    try {
      await garageService.buyDriver(userId, driver);
      await refreshGarage(userId);
      await loadCatalog({
        excludeDriverIds: [...garage.ownedDriverIds, driver.id],
        excludeConstructorIds: garage.ownedConstructorIds,
      });
      onClose();
    } catch (err) {
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown');
    }
  };

  const onBuyConstructor = async (c: Constructor) => {
    if (garage.cash < c.price) {
      Alert.alert('Not enough cash', `${c.name} costs $${c.price}.`);
      return;
    }
    try {
      await garageService.buyConstructor(userId, c);
      await refreshGarage(userId);
      await loadCatalog({
        excludeDriverIds: garage.ownedDriverIds,
        excludeConstructorIds: [...garage.ownedConstructorIds, c.id],
      });
      onClose();
    } catch (err) {
      Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown');
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Add a ${cap}`}
      subtitle={`$${garage.cash} to spend · ${kind === 'driver' ? `${garage.ownedDriverIds.length} owned · ${(garage.rosteredDriverIds?.length ?? 0)}/${garage.rosterDriverSlots ?? 4} active` : `${garage.ownedConstructorIds.length} owned · ${(garage.rosteredConstructorIds?.length ?? 0)}/${garage.rosterConstructorSlots ?? 2} active`}`}
    >
      {/* Offers */}
      <View style={{ gap: 8 }}>
        {kind === 'driver'
          ? offerDrivers.map((d) => (
              <ShopDriverRow key={d.id} driver={d} cash={garage.cash} onBuy={() => onBuyDriver(d)} />
            ))
          : offerConstructors.map((c) => (
              <ShopConstructorRow key={c.id} constructor={c} cash={garage.cash} onBuy={() => onBuyConstructor(c)} />
            ))}
        {offerLoading ? (
          <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 11, textAlign: 'center', padding: 20 }}>
            Loading offers…
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

function ShopDriverRow({ driver, cash, onBuy }: { driver: Driver; cash: number; onBuy: () => void }) {
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
        borderRadius: 12,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        opacity: canAfford ? 1 : 0.55,
      }}
    >
      <DriverPortrait driver={driver} size={42} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 14, color: t.text, letterSpacing: -0.3 }} numberOfLines={1}>
            {driver.name}
          </Text>
          <TierChip tier={driver.tier} />
          <TierMultBadge tier={driver.tier} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 1 }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: teamColor, fontWeight: '600' }}>{teamShort}</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, opacity: 0.5 }}>·</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim }}>{driver.fantasyPoints} pts</Text>
        </View>
      </View>
      <Pressable
        onPress={canAfford ? onBuy : undefined}
        disabled={!canAfford}
        style={({ pressed }) => [
          {
            height: 38,
            paddingHorizontal: 12,
            borderRadius: 9,
            backgroundColor: canAfford ? t.accent : 'transparent',
            borderWidth: canAfford ? 0 : 1,
            borderColor: t.line,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            minWidth: 72,
          },
        ]}
      >
        <Num size={13} weight="700" color={canAfford ? '#0E1116' : t.textMute}>
          ${driver.price}
        </Num>
        <Text
          style={{
            color: canAfford ? '#0E1116' : t.textMute,
            fontFamily: t.fMono,
            fontSize: 8,
            fontWeight: '700',
            letterSpacing: 1,
            marginTop: 1,
            opacity: 0.7,
          }}
        >
          {canAfford ? 'BUY' : 'SHORT'}
        </Text>
      </Pressable>
    </View>
  );
}

function ShopConstructorRow({ constructor, cash, onBuy }: { constructor: Constructor; cash: number; onBuy: () => void }) {
  const t = useTheme();
  const color = (CONSTRUCTOR_COLORS as Record<string, string>)[constructor.shortName] || constructor.primaryColor || t.accent;
  const canAfford = cash >= constructor.price;
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 12,
        padding: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        opacity: canAfford ? 1 : 0.55,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color }} />
      <View style={{ flex: 1, paddingLeft: 8 }}>
        <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 14, color: t.text, letterSpacing: -0.3 }} numberOfLines={1}>
          {constructor.name}
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textDim, marginTop: 1 }}>
          {constructor.fantasyPoints} pts
        </Text>
      </View>
      <Pressable
        onPress={canAfford ? onBuy : undefined}
        disabled={!canAfford}
        style={({ pressed }) => [
          {
            height: 38,
            paddingHorizontal: 12,
            borderRadius: 9,
            backgroundColor: canAfford ? t.accent : 'transparent',
            borderWidth: canAfford ? 0 : 1,
            borderColor: t.line,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            minWidth: 72,
          },
        ]}
      >
        <Num size={13} weight="700" color={canAfford ? '#0E1116' : t.textMute}>
          ${constructor.price}
        </Num>
        <Text
          style={{
            color: canAfford ? '#0E1116' : t.textMute,
            fontFamily: t.fMono,
            fontSize: 8,
            fontWeight: '700',
            letterSpacing: 1,
            marginTop: 1,
            opacity: 0.7,
          }}
        >
          {canAfford ? 'BUY' : 'SHORT'}
        </Text>
      </Pressable>
    </View>
  );
}
