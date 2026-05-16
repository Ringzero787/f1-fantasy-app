import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Sheet } from './Sheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import { insuranceService } from '@services/insurance.service';
import { useInsuranceStore } from '@store/insurance.store';
import { useGarageStore } from '@store/garage.store';
import { Num, InsuranceShield } from '@components/tl';
import type { Driver, RaceInsurance } from '@/types';

export function InsuranceSheet({
  visible,
  onClose,
  driver,
  bench,
  userId,
  raceId,
  cash,
  existingInsurance,
}: {
  visible: boolean;
  onClose: () => void;
  driver: Driver;
  bench: Driver[]; // owned drivers other than this one
  userId: string;
  raceId: string;
  cash: number;
  existingInsurance: RaceInsurance | null;
}) {
  const t = useTheme();
  const refreshInsurance = useInsuranceStore((s) => s.refresh);
  const refreshGarage = useGarageStore((s) => s.refresh);

  const existing = existingInsurance?.policies?.[driver.id];
  const [active, setActive] = useState(!!existing);
  const [backupId, setBackupId] = useState<string | null>(existing?.backupDriverId ?? null);
  const [submitting, setSubmitting] = useState(false);

  const premium = active ? insuranceService.computePremium(driver, !!backupId) : 0;
  const canAfford = cash >= premium - (existing?.premium ?? 0);

  const onApply = async () => {
    setSubmitting(true);
    try {
      if (active) {
        await insuranceService.activate({
          userId,
          raceId,
          insuredDriver: driver,
          backupDriverId: backupId,
        });
      } else if (existing) {
        await insuranceService.drop({ userId, raceId, driverId: driver.id });
      }
      await Promise.all([refreshInsurance(userId, raceId), refreshGarage(userId)]);
      onClose();
    } catch (err) {
      Alert.alert('Insurance failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setSubmitting(false);
    }
  };

  const teamShort = (driver.constructorName || '').slice(0, 3).toUpperCase();
  const teamColor = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || t.accent;

  return (
    <Sheet visible={visible} onClose={onClose} title={`Insure ${driver.name}?`} subtitle="Backup driver scores 50% if your started driver DNFs.">
      {/* Driver banner */}
      <View
        style={{
          backgroundColor: t.surface2,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.line,
          padding: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: teamColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontWeight: '800', fontSize: 12 }}>{driver.shortName}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 16, color: t.text }}>{driver.name}</Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 11, color: t.textDim, marginTop: 2 }}>
            ${driver.price} · 7% premium
          </Text>
        </View>
      </View>

      {/* Active toggle */}
      <Pressable
        onPress={() => setActive((v) => !v)}
        style={{
          marginTop: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          backgroundColor: active ? t.accentSoft : t.surface,
          borderWidth: 1,
          borderColor: active ? t.accent : t.line,
          borderRadius: 12,
        }}
      >
        <InsuranceShield active={active} size={22} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: t.fSans, fontSize: 14, fontWeight: '600', color: t.text }}>
            {active ? 'Insurance enabled' : 'Insurance off'}
          </Text>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 2, letterSpacing: 0.4 }}>
            Tap to {active ? 'disable' : 'enable'}
          </Text>
        </View>
      </Pressable>

      {/* Backup picker */}
      {active ? (
        <View style={{ marginTop: 12 }}>
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
            Backup driver (optional)
          </Text>
          <View style={{ gap: 6 }}>
            <Pressable
              onPress={() => setBackupId(null)}
              style={{
                padding: 12,
                backgroundColor: !backupId ? t.accentSoft : t.surface,
                borderWidth: 1,
                borderColor: !backupId ? t.accent : t.line,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '600', color: t.text }}>No backup</Text>
              <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 2 }}>
                Insurance triggers nothing — premium just covers the lost potential.
              </Text>
            </Pressable>
            {bench.map((d) => {
              const ds = (d.constructorName || '').slice(0, 3).toUpperCase();
              const dc = (CONSTRUCTOR_COLORS as Record<string, string>)[ds] || t.accent;
              const selected = backupId === d.id;
              return (
                <Pressable
                  key={d.id}
                  onPress={() => setBackupId(d.id)}
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
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: dc,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontWeight: '700', fontSize: 10 }}>{d.shortName}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: t.fSans, fontSize: 13, fontWeight: '500', color: t.text }}>{d.name}</Text>
                    <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 2 }}>
                      {d.constructorName} · {d.fantasyPoints} pts
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {backupId ? (
            <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, marginTop: 8, lineHeight: 14 }}>
              Backup adds 60% to the premium. Triggers on DNF/DSQ — backup scores 50% in the started driver's place.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Premium summary */}
      <View
        style={{
          marginTop: 14,
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
            Premium this race
          </Text>
          <Num size={22} weight="700" color={active ? t.text : t.textDim}>${premium}</Num>
        </View>
        {existing ? (
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
              Currently
            </Text>
            <Text style={{ fontFamily: t.fMono, fontSize: 13, fontWeight: '700', color: t.success, marginTop: 2 }}>
              Insured · ${existing.premium}
            </Text>
          </View>
        ) : null}
      </View>

      {!canAfford && active ? (
        <Text style={{ marginTop: 8, color: t.danger, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4 }}>
          Not enough cash on hand.
        </Text>
      ) : null}

      <Pressable
        onPress={onApply}
        disabled={submitting || (active && !canAfford)}
        style={({ pressed }) => [
          {
            marginTop: 14,
            height: 48,
            borderRadius: 12,
            backgroundColor: active && !canAfford ? t.surface2 : t.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: submitting ? 0.5 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={{
            color: active && !canAfford ? t.textMute : '#0E1116',
            fontFamily: t.fMono,
            fontSize: 13,
            fontWeight: '700',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {submitting ? '…' : active ? 'Lock in cover' : existing ? 'Drop cover (80% refund)' : 'Skip'}
        </Text>
      </Pressable>
    </Sheet>
  );
}
