import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Sheet } from './Sheet';
import { useTheme } from '@/theme';
import { betsService, betsConfig } from '@services/bets.service';
import { useBetsStore } from '@store/bets.store';
import { useGarageStore } from '@store/garage.store';
import { TierChip, Num } from '@components/tl';
import type { Driver, LeagueMember, League, RaceBets } from '@/types';

export function BetSheet({
  visible,
  onClose,
  market,
  userId,
  raceId,
  cash,
  poleCandidates,
  league,
  leagueMembers,
  currentBets,
}: {
  visible: boolean;
  onClose: () => void;
  market: 'pole' | 'league';
  userId: string;
  raceId: string;
  cash: number;
  poleCandidates: Driver[];
  league: League | null;
  leagueMembers: LeagueMember[];
  currentBets: RaceBets | null;
}) {
  const t = useTheme();
  const refreshBets = useBetsStore((s) => s.refresh);
  const refreshGarage = useGarageStore((s) => s.refresh);

  const existing = market === 'pole' ? currentBets?.poleBet : currentBets?.leagueBet;

  const [poleDriverId, setPoleDriverId] = useState<string | null>(
    market === 'pole' && currentBets?.poleBet ? currentBets.poleBet.driverId : null
  );
  const [leagueTargetId, setLeagueTargetId] = useState<string | null>(
    market === 'league' && currentBets?.leagueBet ? currentBets.leagueBet.targetUserId : null
  );
  const [stakeStr, setStakeStr] = useState<string>(existing ? String(existing.stake) : '5');
  const [submitting, setSubmitting] = useState(false);

  const stakeCap = Math.floor(cash * betsConfig.STAKE_MAX_PCT);
  const stake = parseInt(stakeStr || '0', 10);
  const validStake = Number.isFinite(stake) && stake > 0 && stake <= cash && stake <= stakeCap;

  let odds = 0;
  let payoutIfWin = 0;
  let pickValid = false;

  if (market === 'pole') {
    const d = poleCandidates.find((x) => x.id === poleDriverId);
    if (d) {
      odds = betsService.poleOddsForTier(d.tier);
      payoutIfWin = stake * odds;
      pickValid = true;
    }
  } else {
    const m = leagueMembers.find((x) => x.userId === leagueTargetId);
    if (m && league) {
      odds = league.memberCount;
      payoutIfWin = stake * odds;
      pickValid = true;
    }
  }

  const onPlace = async () => {
    if (!pickValid || !validStake) return;
    setSubmitting(true);
    try {
      if (market === 'pole') {
        const d = poleCandidates.find((x) => x.id === poleDriverId);
        if (!d) return;
        await betsService.placePoleBet({ userId, raceId, driver: d, stake });
      } else {
        const m = leagueMembers.find((x) => x.userId === leagueTargetId);
        if (!m || !league) return;
        await betsService.placeLeagueBet({ userId, raceId, target: m, league, stake });
      }
      await Promise.all([refreshBets(userId, raceId), refreshGarage(userId)]);
      onClose();
    } catch (err) {
      Alert.alert('Bet failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = async () => {
    if (!existing) return;
    Alert.alert('Cancel bet?', '80% refund (house keeps 20%)', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel · 80% refund',
        style: 'destructive',
        onPress: async () => {
          setSubmitting(true);
          try {
            if (market === 'pole') await betsService.cancelPoleBet({ userId, raceId });
            else await betsService.cancelLeagueBet({ userId, raceId });
            await Promise.all([refreshBets(userId, raceId), refreshGarage(userId)]);
            onClose();
          } catch (err) {
            Alert.alert('Cancel failed', err instanceof Error ? err.message : 'Unknown');
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const title = market === 'pole' ? 'Pole position bet' : "This week's league winner";
  const subtitle =
    market === 'pole'
      ? 'Cash · no points. A=2x, B=5x, C=15x. Closes pre-quali.'
      : `Cash · no points. Payout = league size (${league?.memberCount ?? 0}x). Closes pre-race.`;

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {/* Pick */}
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Pick
      </Text>
      <View style={{ gap: 6, marginBottom: 14 }}>
        {market === 'pole'
          ? poleCandidates.map((d) => {
              const selected = poleDriverId === d.id;
              const driverOdds = betsService.poleOddsForTier(d.tier);
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setPoleDriverId(d.id)}
                  style={{
                    padding: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: selected ? t.accentSoft : t.surface,
                    borderWidth: 1,
                    borderColor: selected ? t.accent : t.line,
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ width: 36, fontFamily: t.fMono, fontWeight: '700', color: t.text, fontSize: 11 }}>{d.shortName}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '500', color: t.text }}>{d.name}</Text>
                    <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 2 }}>
                      {d.constructorName}
                    </Text>
                  </View>
                  <TierChip tier={d.tier} />
                  <Num size={14} weight="700" color={t.accent}>
                    {driverOdds}x
                  </Num>
                </Pressable>
              );
            })
          : leagueMembers
              .filter((m) => m.userId !== userId)
              .map((m) => {
                const selected = leagueTargetId === m.userId;
                return (
                  <Pressable
                    key={m.userId}
                    onPress={() => setLeagueTargetId(m.userId)}
                    style={{
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      backgroundColor: selected ? t.accentSoft : t.surface,
                      borderWidth: 1,
                      borderColor: selected ? t.accent : t.line,
                      borderRadius: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '500', color: t.text }}>{m.displayName}</Text>
                      <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 2 }}>
                        {m.totalPoints} pts · {m.raceWins} wins
                      </Text>
                    </View>
                    <Num size={14} weight="700" color={t.accent}>
                      {league?.memberCount ?? 0}x
                    </Num>
                  </Pressable>
                );
              })}
      </View>

      {/* Stake */}
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Stake (max ${stakeCap})
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ fontFamily: t.fMono, fontSize: 18, color: t.textDim }}>$</Text>
        <TextInput
          value={stakeStr}
          onChangeText={setStakeStr}
          placeholder="0"
          placeholderTextColor={t.textMute}
          keyboardType="number-pad"
          style={{
            flex: 1,
            fontFamily: t.fMono,
            fontSize: 18,
            fontWeight: '600',
            color: t.text,
          }}
        />
      </View>

      {/* Quick stake chips */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
        {[5, 10, 25, stakeCap].map((amt) => {
          if (amt > stakeCap) return null;
          return (
            <Pressable
              key={amt}
              onPress={() => setStakeStr(String(amt))}
              style={{
                flex: 1,
                paddingVertical: 6,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.surface,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '700', color: t.textDim }}>
                ${amt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Payout summary */}
      <View
        style={{
          padding: 12,
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              fontWeight: '700',
              color: t.textMute,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            If you win
          </Text>
          <Num size={22} weight="700" color={t.success}>
            +${payoutIfWin}
          </Num>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              fontWeight: '700',
              color: t.textMute,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            If you lose
          </Text>
          <Num size={14} weight="700" color={t.danger}>
            −${stake || 0}
          </Num>
        </View>
      </View>

      <Pressable
        onPress={onPlace}
        disabled={submitting || !pickValid || !validStake}
        style={({ pressed }) => [
          {
            marginTop: 14,
            height: 48,
            borderRadius: 12,
            backgroundColor: pickValid && validStake ? t.accent : t.surface2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: submitting ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: pickValid && validStake ? '#0E1116' : t.textMute,
            fontFamily: t.fMono,
            fontSize: 13,
            fontWeight: '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {submitting ? '…' : existing ? 'Update bet' : 'Place bet'}
        </Text>
      </Pressable>

      {existing ? (
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [
            {
              marginTop: 8,
              height: 38,
              borderRadius: 10,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: t.danger,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ color: t.danger, fontFamily: t.fMono, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 }}>
            Cancel bet · 80% refund
          </Text>
        </Pressable>
      ) : null}
    </Sheet>
  );
}
