// Purchase confirmation sheet — replaces the old double-Alert buy flow.
// Shows the pack's helmet previews + item list, one Buy button with an
// in-button loading state, success flash, inline errors. Packs are paid with
// garage cash (won at settlements) — the sheet shows the price and the
// bankroll it leaves behind, and blocks the buy when cash is short.

import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { useTheme } from '../../theme';
import type { CosmeticPack } from '../../types';
import { PACK_PRICE_GAME_CASH } from '../../data/cosmeticsCatalog';

const SURFACE_LABEL: Record<string, string> = {
  helmet_livery: 'Helmet',
  app_icon: 'App icon',
  garage_skin: 'Garage skin',
  cash_icon: 'Cash icon',
  driver_frame: 'Frame',
};

export function PurchaseSheet({
  pack,
  cash,
  onClose,
  onBuy,
}: {
  pack: CosmeticPack | null;
  cash: number;
  onClose: () => void;
  onBuy: (pack: CosmeticPack) => Promise<void>;
}) {
  const t = useTheme();
  const [state, setState] = useState<'idle' | 'buying' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const helmets = pack?.items.filter((i) => i.surface === 'helmet_livery' && i.previewURL) ?? [];
  const others = pack?.items.filter((i) => !(i.surface === 'helmet_livery' && i.previewURL)) ?? [];
  const price = pack ? PACK_PRICE_GAME_CASH[pack.id] ?? 0 : 0;
  const canAfford = cash >= price;

  const buy = async () => {
    if (!pack || state !== 'idle') return;
    setState('buying');
    setError(null);
    try {
      await onBuy(pack);
      setState('done');
      setTimeout(() => {
        setState('idle');
        onClose();
      }, 900);
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Purchase failed — try again');
    }
  };

  return (
    <Sheet
      visible={!!pack}
      onClose={() => {
        if (state !== 'buying') {
          setState('idle');
          setError(null);
          onClose();
        }
      }}
      title={pack?.name ?? ''}
      subtitle={pack?.tagline}
    >
      {helmets.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          {helmets.map((h) => (
            <View
              key={h.id}
              style={{
                flex: 1,
                aspectRatio: 1,
                backgroundColor: t.surface2,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.line,
                padding: 10,
                alignItems: 'center',
              }}
            >
              <Image source={{ uri: h.previewURL }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
              <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 9, marginTop: 6 }} numberOfLines={1}>
                {h.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {others.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {others.map((i) => (
            <View
              key={i.id}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: t.surface2,
                borderWidth: 1,
                borderColor: t.line,
              }}
            >
              <Text style={{ color: t.textDim, fontFamily: t.fMono, fontSize: 10 }}>
                {SURFACE_LABEL[i.surface] ?? i.surface} · {i.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text
        style={{
          color: t.textDim,
          fontFamily: t.fMono,
          fontSize: 12,
          marginBottom: 10,
          fontVariant: ['tabular-nums'],
        }}
      >
        {canAfford
          ? `Bankroll $${cash} → $${Math.round((cash - price) * 100) / 100} after purchase`
          : `Bankroll $${cash} — you need $${Math.round((price - cash) * 100) / 100} more. Win it on race weekend.`}
      </Text>

      {error ? (
        <Text style={{ color: '#F25C54', fontFamily: t.fSans, fontSize: 13, marginBottom: 10 }}>{error}</Text>
      ) : null}

      <Pressable
        onPress={buy}
        disabled={state !== 'idle' || !canAfford}
        style={({ pressed }) => [
          {
            height: 52,
            borderRadius: 12,
            backgroundColor: state === 'done' ? t.success : canAfford ? t.accent : t.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed && state === 'idle' && canAfford ? 0.85 : 1,
          },
        ]}
      >
        {state === 'buying' ? (
          <ActivityIndicator color="#0E1116" />
        ) : (
          <Text
            style={{
              color: canAfford || state === 'done' ? '#0E1116' : t.textMute,
              fontFamily: t.fSans,
              fontSize: 16,
              fontWeight: '700',
            }}
          >
            {state === 'done' ? 'Added to your gear ✓' : canAfford ? `Buy · $${price}` : `Need $${price}`}
          </Text>
        )}
      </Pressable>
    </Sheet>
  );
}
