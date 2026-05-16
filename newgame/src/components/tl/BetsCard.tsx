// BetsCard — inline component on the Lineup screen between countdown and drivers.
// Shows the two side-bet markets (League winner + Pole) in compact rows.

import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { DiceGlyph } from './atoms';
import type { RaceBets } from '@/types';

export function BetsCard({
  bets,
  onOpenLeague,
  onOpenPole,
  hasLeague,
}: {
  bets: RaceBets | null;
  onOpenLeague: () => void;
  onOpenPole: () => void;
  hasLeague: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 10,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.line,
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 7,
          backgroundColor: t.surface2,
          borderBottomWidth: 1,
          borderBottomColor: t.lineSoft,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <DiceGlyph size={12} />
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              fontWeight: '700',
              color: t.text,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            Side bets
          </Text>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              color: t.textMute,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            · cash · no points
          </Text>
        </View>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 9,
            color: t.textMute,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Closes pre-quali
        </Text>
      </View>

      {hasLeague ? (
        <BetRow
          title="Pick this week's league winner"
          placed={
            bets?.leagueBet
              ? {
                  label: bets.leagueBet.targetDisplayName,
                  stake: bets.leagueBet.stake,
                  odds: bets.leagueBet.odds,
                }
              : null
          }
          onPress={onOpenLeague}
        />
      ) : null}
      <BetRow
        title="Bet on pole position"
        placed={
          bets?.poleBet
            ? {
                label: bets.poleBet.driverName,
                stake: bets.poleBet.stake,
                odds: bets.poleBet.odds,
              }
            : null
        }
        onPress={onOpenPole}
        isLast
      />
    </View>
  );
}

function BetRow({
  title,
  placed,
  onPress,
  isLast,
}: {
  title: string;
  placed: { label: string; stake: number; odds: number } | null;
  onPress: () => void;
  isLast?: boolean;
}) {
  const t = useTheme();
  const has = !!placed;
  const payout = has ? Math.round(placed.stake * placed.odds) : 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 12,
          paddingVertical: 9,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: t.lineSoft,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          backgroundColor: has ? t.accentSoft : t.surface2,
          borderWidth: 1,
          borderColor: has ? t.accentDim : t.line,
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: t.fSans, fontSize: 12, fontWeight: '600', color: t.text }} numberOfLines={1}>
          {has ? placed.label : title}
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: has ? t.success : t.textMute, letterSpacing: 0.4, marginTop: 1 }}>
          {has
            ? `$${placed.stake} @ ${placed.odds}x → $${payout}`
            : 'Tap to place'}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '700',
          color: has ? t.accent : t.textDim,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        {has ? 'Edit ›' : 'Bet ›'}
      </Text>
    </Pressable>
  );
}
