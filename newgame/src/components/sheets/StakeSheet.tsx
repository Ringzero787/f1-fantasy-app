// StakeSheet — full-sheet modal for setting a Ben pick.
// Tapping a row on the Lineup screen opens this. User can flip side, set a
// stake (preset chips + custom keypad), and see the payout preview.
//
// Source layout: design_handoff_track_limits/screen-lineup.jsx StakeSheet.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Sheet } from './Sheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { Num, PrimaryBtn, WithAgainstToggle } from '@components/tl';
import type { BenLine, BenSide, Driver, Constructor, SessionKey } from '@/types';

// Preset stake chips scaled to a $1000 budget. The design's slider ran 0-10M;
// these are equivalent slots in our scale.
const PRESETS = [0, 25, 50, 100, 250];

export function StakeSheet({
  visible,
  onClose,
  entityKind,
  driver,
  team,
  scope,
  line,
  initialSide,
  initialStake,
  cash,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  entityKind: 'driver' | 'constructor';
  driver?: Driver;
  team?: Constructor;
  scope: SessionKey;
  line: BenLine | null;
  initialSide: BenSide;
  initialStake: number;
  cash: number;
  onApply: (next: { side: BenSide; stake: number }) => void;
}) {
  const t = useTheme();
  const [side, setSide] = useState<BenSide>(initialSide);
  const [stake, setStake] = useState<number>(initialStake);
  const [customMode, setCustomMode] = useState(false);
  const [draft, setDraft] = useState(String(initialStake));

  // Reset whenever the sheet opens for a different entity.
  useEffect(() => {
    if (visible) {
      setSide(initialSide);
      setStake(initialStake);
      setDraft(String(initialStake));
      setCustomMode(false);
    }
  }, [visible, initialSide, initialStake]);

  const isDriver = entityKind === 'driver';
  const name = isDriver ? driver?.name : team?.name;
  const teamShort = isDriver ? (driver?.constructorName || '').slice(0, 3).toUpperCase() : team?.shortName;
  const teamColor =
    (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort || ''] || team?.primaryColor || t.accent;

  const against = side === 'against';
  const odds = line ? (against ? line.againstOdds : line.withOdds) : 0;
  const payout = stake > 0 && odds > 0 ? Math.round(stake * odds) : 0;
  const profit = Math.max(0, payout - stake);
  const sideColor = against ? t.danger : t.accent;
  const sideLabel = against ? 'Against Ben' : 'With Ben';
  const maxStake = Math.min(cash, 1000);

  const flipSide = () => setSide((s) => (s === 'against' ? 'with' : 'against'));

  const commitCustom = () => {
    const n = Math.max(0, Math.min(maxStake, parseInt(draft || '0', 10) || 0));
    setStake(n);
    setDraft(String(n));
    setCustomMode(false);
  };

  const apply = () => {
    onApply({ side, stake });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`${name ?? '—'} · ${scope === 'qualifying' ? 'Qualifying' : scope === 'race' ? 'Race' : 'Sprint'}`}
      subtitle={`${sideLabel.toUpperCase()} · place a stake or skip to keep the pick free`}
    >
      {/* Side flip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
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
          Side
        </Text>
        <WithAgainstToggle side={side} onFlip={flipSide} />
        <View
          style={{
            marginLeft: 'auto',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 4,
            backgroundColor: `${teamColor}22`,
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: teamColor }} />
          <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: teamColor, letterSpacing: 0.8 }}>
            {teamShort}
          </Text>
        </View>
      </View>

      {/* Ben line readout */}
      <View
        style={{
          marginTop: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 8,
          backgroundColor: t.accentSoft,
          borderWidth: 1.5,
          borderColor: t.accentDim,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              backgroundColor: t.accentDim,
            }}
          >
            <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: t.accent, letterSpacing: 1 }}>
              BEN
            </Text>
          </View>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              color: t.textMute,
              fontWeight: '700',
              letterSpacing: 0.6,
            }}
          >
            O/U
          </Text>
          <Text
            style={{
              fontFamily: t.fDisp,
              fontSize: 22,
              fontWeight: '700',
              color: t.text,
              letterSpacing: -0.4,
              fontVariant: ['tabular-nums'],
            }}
          >
            {line?.line != null ? (line.line % 1 === 0.5 ? line.line.toFixed(1) : line.line.toString()) : '—'}
          </Text>
        </View>
        <View
          style={{
            paddingLeft: 10,
            borderLeftWidth: 1,
            borderLeftColor: t.line,
            alignItems: 'flex-end',
          }}
        >
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 9,
              fontWeight: '700',
              color: t.textMute,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}
          >
            {sideLabel} pays
          </Text>
          <Text
            style={{
              fontFamily: t.fDisp,
              fontSize: 20,
              fontWeight: '700',
              color: sideColor,
              letterSpacing: -0.3,
              fontVariant: ['tabular-nums'],
            }}
          >
            {odds > 0 ? `${odds.toFixed(2)}x` : '—'}
          </Text>
        </View>
      </View>

      {/* Stake controls */}
      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 10,
              fontWeight: '700',
              color: t.textMute,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Stake
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
            <Text style={{ fontFamily: t.fDisp, fontSize: 14, color: t.textDim, fontWeight: '500' }}>$</Text>
            <Num size={26} weight="700">
              {stake}
            </Num>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {PRESETS.map((amt) => {
            const disabled = amt > maxStake;
            const active = stake === amt && !customMode;
            return (
              <Pressable
                key={amt}
                onPress={disabled ? undefined : () => { setStake(amt); setCustomMode(false); }}
                disabled={disabled}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    height: 36,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? sideColor : t.line,
                    backgroundColor: active ? `${sideColor}22` : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text
                  style={{
                    fontFamily: t.fMono,
                    fontSize: 12,
                    fontWeight: '700',
                    color: active ? sideColor : t.text,
                  }}
                >
                  {amt === 0 ? 'Free' : `$${amt}`}
                </Text>
              </Pressable>
            );
          })}
          <Pressable
            onPress={() => { setCustomMode(true); setDraft(String(stake)); }}
            style={({ pressed }) => [
              {
                flex: 1,
                height: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: customMode ? sideColor : t.line,
                backgroundColor: customMode ? `${sideColor}22` : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '700', color: customMode ? sideColor : t.text }}>
              Custom
            </Text>
          </Pressable>
        </View>
        {customMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <Text style={{ fontFamily: t.fMono, fontSize: 14, fontWeight: '700', color: t.textDim }}>$</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              keyboardType="number-pad"
              autoFocus
              onSubmitEditing={commitCustom}
              onBlur={commitCustom}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: sideColor,
                paddingHorizontal: 10,
                color: t.text,
                fontFamily: t.fMono,
                fontSize: 14,
                fontWeight: '700',
              }}
            />
            <Pressable
              onPress={commitCustom}
              style={({ pressed }) => [
                {
                  height: 36,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  backgroundColor: sideColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '800', color: '#0E1116', letterSpacing: 0.8 }}>
                SET
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 9,
            color: t.textMute,
            letterSpacing: 0.4,
            marginTop: 6,
            textAlign: 'right',
          }}
        >
          Max stake ${maxStake} · Bankroll ${cash}
        </Text>
      </View>

      {/* Payout preview */}
      <View
        style={{
          marginTop: 14,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: stake > 0 ? t.success : t.line,
          backgroundColor: stake > 0 ? `${t.success}1A` : t.surface2,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '700', color: t.textDim }}>
          {stake === 0 ? 'Free pick · +1 point on a win' : 'If you win'}
        </Text>
        {stake > 0 ? (
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 14,
              fontWeight: '800',
              color: t.success,
              fontVariant: ['tabular-nums'],
            }}
          >
            +${profit} (${payout} total)
          </Text>
        ) : (
          <Text style={{ fontFamily: t.fMono, fontSize: 12, fontWeight: '700', color: t.textDim }}>$0 cash · 1 pt</Text>
        )}
      </View>

      {/* Actions */}
      <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            {
              flex: 1,
              height: 46,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={{
              fontFamily: t.fMono,
              fontSize: 11,
              fontWeight: '700',
              color: t.textDim,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            Cancel
          </Text>
        </Pressable>
        <View style={{ flex: 2 }}>
          <PrimaryBtn title={stake === 0 ? 'Save pick (no stake)' : `Lock $${stake}`} onPress={apply} />
        </View>
      </View>
    </Sheet>
  );
}
