import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@store/auth.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { garageService, garageConfig } from '@services/garage.service';
import {
  DriverPortrait,
  TierChip,
  TierMultBadge,
  Num,
  SectionLabel,
  Cash,
} from '@components/tl';
import { ReplaceSheet } from '@components/sheets/ReplaceSheet';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import type { Driver, Constructor } from '@/types';

export default function GarageScreen() {
  const t = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const {
    garage,
    rosteredDrivers,
    benchDrivers,
    rosteredConstructors,
    benchConstructors,
    isLoading,
    refetch,
  } = useGarageWithEntities();
  const [replacing, setReplacing] = useState<{ kind: 'driver' | 'constructor'; item: Driver | Constructor } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!garage) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const driverSlots = garage.rosterDriverSlots ?? garageConfig.ROSTER_DRIVER_SLOTS;
  const constructorSlots = garage.rosterConstructorSlots ?? garageConfig.ROSTER_CONSTRUCTOR_SLOTS;

  const handleBenchDriver = async (driver: Driver) => {
    if (!userId || busy) return;
    if (rosteredDrivers.length <= 2) {
      Alert.alert('Cannot bench', 'You need at least 2 drivers in your active roster to start a race.');
      return;
    }
    try {
      setBusy(true);
      await garageService.benchDriver(userId, driver.id);
      refetch();
    } catch (err) {
      Alert.alert('Bench failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setBusy(false);
    }
  };

  const handleDeployDriver = async (driver: Driver) => {
    if (!userId || busy) return;
    if (rosteredDrivers.length < driverSlots) {
      try {
        setBusy(true);
        await garageService.deployDriver(userId, driver.id);
        refetch();
      } catch (err) {
        Alert.alert('Deploy failed', err instanceof Error ? err.message : 'Unknown');
      } finally {
        setBusy(false);
      }
      return;
    }
    // Roster full — prompt to swap with an active driver.
    Alert.alert(
      `Active roster full`,
      `Pick a driver to bench so ${driver.name} can take their slot.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...rosteredDrivers.map((r) => ({
          text: `Bench ${r.name}`,
          onPress: async () => {
            try {
              setBusy(true);
              await garageService.swapRosterDriver(userId, r.id, driver.id);
              refetch();
            } catch (err) {
              Alert.alert('Swap failed', err instanceof Error ? err.message : 'Unknown');
            } finally {
              setBusy(false);
            }
          },
        })),
      ]
    );
  };

  const handleBenchConstructor = async (c: Constructor) => {
    if (!userId || busy) return;
    if (rosteredConstructors.length <= 1) {
      Alert.alert('Cannot bench', 'You need at least 1 constructor in your active roster.');
      return;
    }
    try {
      setBusy(true);
      await garageService.benchConstructor(userId, c.id);
      refetch();
    } catch (err) {
      Alert.alert('Bench failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setBusy(false);
    }
  };

  const handleDeployConstructor = async (c: Constructor) => {
    if (!userId || busy) return;
    if (rosteredConstructors.length < constructorSlots) {
      try {
        setBusy(true);
        await garageService.deployConstructor(userId, c.id);
        refetch();
      } catch (err) {
        Alert.alert('Deploy failed', err instanceof Error ? err.message : 'Unknown');
      } finally {
        setBusy(false);
      }
      return;
    }
    Alert.alert(
      `Constructor slots full`,
      `Pick a constructor to bench so ${c.name} can take their slot.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...rosteredConstructors.map((r) => ({
          text: `Bench ${r.name}`,
          onPress: async () => {
            try {
              setBusy(true);
              await garageService.swapRosterConstructor(userId, r.id, c.id);
              refetch();
            } catch (err) {
              Alert.alert('Swap failed', err instanceof Error ? err.message : 'Unknown');
            } finally {
              setBusy(false);
            }
          },
        })),
      ]
    );
  };

  const handleReleaseDriver = (driver: Driver) => {
    setReplacing({ kind: 'driver', item: driver });
  };
  const handleReleaseConstructor = (c: Constructor) => {
    setReplacing({ kind: 'constructor', item: c });
  };

  const totalDrivers = rosteredDrivers.length + benchDrivers.length;
  const totalConstructors = rosteredConstructors.length + benchConstructors.length;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: t.bg }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={t.accent} />}
      >
        <View style={{ padding: 20, paddingTop: 4 }}>
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
          <View style={{ marginTop: 4 }}>
            <Cash amount={garage.cash} size={42} accent />
          </View>

          <View
            style={{
              marginTop: 18,
              paddingVertical: 12,
              borderTopWidth: 1,
              borderTopColor: t.line,
              borderBottomWidth: 1,
              borderBottomColor: t.line,
              flexDirection: 'row',
            }}
          >
            <Stat label="Season pts" value={`${garage.totalPoints}`} />
            <Stat label="Cash earned" value={`$${garage.totalCashEarned}`} divider />
            <Stat
              label="Win streak"
              value={`W${garage.raceWinStreak}`}
              divider
              color={garage.raceWinStreak > 0 ? t.success : undefined}
            />
          </View>
        </View>

        {/* Active Roster — Drivers */}
        <SectionLabel trailing={`${rosteredDrivers.length} / ${driverSlots} ACTIVE`}>
          Drivers · Active
        </SectionLabel>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {rosteredDrivers.map((d) => (
            <RosteredDriverCard
              key={d.id}
              driver={d}
              canBench={rosteredDrivers.length > 2}
              onBench={() => handleBenchDriver(d)}
              onRelease={() => handleReleaseDriver(d)}
            />
          ))}
        </View>

        {/* Bench — Drivers */}
        {benchDrivers.length > 0 ? (
          <>
            <View style={{ height: 14 }} />
            <SectionLabel trailing={`${benchDrivers.length} BENCHED`}>Drivers · Bench</SectionLabel>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {benchDrivers.map((d) => (
                <BenchDriverCard
                  key={d.id}
                  driver={d}
                  onDeploy={() => handleDeployDriver(d)}
                  onRelease={() => handleReleaseDriver(d)}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={{ height: 22 }} />

        {/* Active — Constructors */}
        <SectionLabel trailing={`${rosteredConstructors.length} / ${constructorSlots} ACTIVE`}>
          Constructors · Active
        </SectionLabel>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {rosteredConstructors.map((c) => (
            <RosteredConstructorCard
              key={c.id}
              constructor={c}
              canBench={rosteredConstructors.length > 1}
              onBench={() => handleBenchConstructor(c)}
              onRelease={() => handleReleaseConstructor(c)}
            />
          ))}
        </View>

        {/* Bench — Constructors */}
        {benchConstructors.length > 0 ? (
          <>
            <View style={{ height: 14 }} />
            <SectionLabel trailing={`${benchConstructors.length} BENCHED`}>Constructors · Bench</SectionLabel>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {benchConstructors.map((c) => (
                <BenchConstructorCard
                  key={c.id}
                  constructor={c}
                  onDeploy={() => handleDeployConstructor(c)}
                  onRelease={() => handleReleaseConstructor(c)}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={{ paddingHorizontal: 20, paddingTop: 22 }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 0.6, textAlign: 'center' }}>
            {totalDrivers} drivers · {totalConstructors} constructors owned · build your dream team
          </Text>
        </View>
      </ScrollView>

      {replacing && userId ? (
        <ReplaceSheet
          visible={!!replacing}
          onClose={() => {
            setReplacing(null);
            refetch();
          }}
          kind={replacing.kind}
          releasing={replacing.item}
          userId={userId}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ label, value, color, divider }: { label: string; value: string; color?: string; divider?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        paddingLeft: divider ? 14 : 0,
        borderLeftWidth: divider ? 1 : 0,
        borderLeftColor: t.line,
      }}
    >
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 9,
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Text style={{ marginTop: 2, fontFamily: t.fDisp, fontWeight: '600', fontSize: 20, color: color || t.text, letterSpacing: -0.4 }}>
        {value}
      </Text>
    </View>
  );
}

function DriverHeader({ driver }: { driver: Driver }) {
  const t = useTheme();
  const teamShort = (driver.constructorName || '').slice(0, 3).toUpperCase();
  const teamColor = (CONSTRUCTOR_COLORS as Record<string, string>)[teamShort] || t.accent;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <DriverPortrait driver={driver} size={68} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 19, color: t.text, letterSpacing: -0.3 }}>{driver.name}</Text>
          <TierChip tier={driver.tier} />
          <TierMultBadge tier={driver.tier} />
        </View>
        <Text style={{ fontFamily: t.fMono, fontSize: 13, color: teamColor, fontWeight: '600', marginTop: 3 }}>
          {driver.constructorName}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>Price</Text>
        <Num size={20} weight="600">${driver.price}</Num>
      </View>
    </View>
  );
}

function RosteredDriverCard({
  driver,
  canBench,
  onBench,
  onRelease,
}: {
  driver: Driver;
  canBench: boolean;
  onBench: () => void;
  onRelease: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: t.accent,
        padding: 17,
        gap: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 9,
            fontWeight: '700',
            color: t.accent,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          ● Active
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2 }}>
          {driver.fantasyPoints} PTS
        </Text>
      </View>
      <DriverHeader driver={driver} />
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft, flexDirection: 'row', gap: 10 }}>
        <ActionBtn
          label="Bench"
          tone="ghost"
          disabled={!canBench}
          onPress={onBench}
        />
        <ActionBtn
          label="Release"
          sub={`+$${Math.round(driver.price * garageConfig.RELEASE_REFUND_PCT)}`}
          tone="warn"
          onPress={onRelease}
        />
      </View>
    </View>
  );
}

function BenchDriverCard({
  driver,
  onDeploy,
  onRelease,
}: {
  driver: Driver;
  onDeploy: () => void;
  onRelease: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.line,
        padding: 17,
        gap: 14,
        opacity: 0.95,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 9,
            fontWeight: '600',
            color: t.textMute,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          ○ Benched
        </Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2 }}>
          {driver.fantasyPoints} PTS
        </Text>
      </View>
      <DriverHeader driver={driver} />
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft, flexDirection: 'row', gap: 10 }}>
        <ActionBtn label="Deploy" tone="primary" onPress={onDeploy} />
        <ActionBtn
          label="Release"
          sub={`+$${Math.round(driver.price * garageConfig.RELEASE_REFUND_PCT)}`}
          tone="warn"
          onPress={onRelease}
        />
      </View>
    </View>
  );
}

function ConstructorHeader({ constructor }: { constructor: Constructor }) {
  const t = useTheme();
  const color = (CONSTRUCTOR_COLORS as Record<string, string>)[constructor.shortName] || constructor.primaryColor || t.accent;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 5, alignSelf: 'stretch', borderRadius: 3, backgroundColor: color }} />
      <View style={{ flex: 1, paddingLeft: 4 }}>
        <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 19, color: t.text, letterSpacing: -0.3 }}>{constructor.name}</Text>
        <Text style={{ fontFamily: t.fMono, fontSize: 13, color: t.textDim, marginTop: 2 }}>{constructor.fantasyPoints} pts</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: t.fMono, fontSize: 9, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase' }}>Price</Text>
        <Num size={20} weight="600">${constructor.price}</Num>
      </View>
    </View>
  );
}

function RosteredConstructorCard({
  constructor,
  canBench,
  onBench,
  onRelease,
}: {
  constructor: Constructor;
  canBench: boolean;
  onBench: () => void;
  onRelease: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: t.accent,
        padding: 17,
        gap: 14,
        overflow: 'hidden',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 9,
            fontWeight: '700',
            color: t.accent,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
          }}
        >
          ● Active
        </Text>
      </View>
      <ConstructorHeader constructor={constructor} />
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft, flexDirection: 'row', gap: 10 }}>
        <ActionBtn label="Bench" tone="ghost" disabled={!canBench} onPress={onBench} />
        <ActionBtn
          label="Release"
          sub={`+$${Math.round(constructor.price * garageConfig.RELEASE_REFUND_PCT)}`}
          tone="warn"
          onPress={onRelease}
        />
      </View>
    </View>
  );
}

function BenchConstructorCard({
  constructor,
  onDeploy,
  onRelease,
}: {
  constructor: Constructor;
  onDeploy: () => void;
  onRelease: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: t.line,
        padding: 17,
        gap: 14,
        overflow: 'hidden',
      }}
    >
      <Text
        style={{
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '600',
          color: t.textMute,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        ○ Benched
      </Text>
      <ConstructorHeader constructor={constructor} />
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: t.lineSoft, flexDirection: 'row', gap: 10 }}>
        <ActionBtn label="Deploy" tone="primary" onPress={onDeploy} />
        <ActionBtn
          label="Release"
          sub={`+$${Math.round(constructor.price * garageConfig.RELEASE_REFUND_PCT)}`}
          tone="warn"
          onPress={onRelease}
        />
      </View>
    </View>
  );
}

function ActionBtn({
  label,
  sub,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  sub?: string;
  tone: 'primary' | 'ghost' | 'warn';
  disabled?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  let bg = t.surface2;
  let fg = t.text;
  if (tone === 'primary') {
    bg = t.accent;
    fg = '#0E1116';
  } else if (tone === 'warn') {
    bg = t.surface2;
    fg = t.danger;
  }
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          flex: 1,
          height: 36,
          borderRadius: 9,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: fg,
          fontFamily: t.fMono,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      {sub ? (
        <Text style={{ color: fg, fontFamily: t.fMono, fontSize: 9, fontWeight: '600', opacity: 0.7, marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
