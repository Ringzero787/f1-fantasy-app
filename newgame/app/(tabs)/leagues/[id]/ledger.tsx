import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { ledgerService } from '@services/ledger.service';
import { TypeBadge, CashFlowStat } from '@components/tl';
import { useTheme } from '@/theme';
import type { League, LedgerEntry } from '@/types';

type Filter = 'mine' | 'all';

export default function LedgerHistoryScreen() {
  const t = useTheme();
  const { id: leagueId } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?.id);

  const [league, setLeague] = useState<League | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('mine');
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!leagueId || !userId) return;
    setLoading(true);
    try {
      const l = await leagueService.getLeague(leagueId);
      setLeague(l);
      const list =
        filter === 'mine'
          ? await ledgerService.getLedgerForUser(leagueId, userId)
          : await ledgerService.getLedgerForLeague(leagueId);
      setEntries(list);
    } finally {
      setLoading(false);
    }
  }, [leagueId, userId, filter]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16 }}>
        <Text style={{ color: t.textDim, fontFamily: t.fSans, fontSize: 12, lineHeight: 18 }}>
          Full audit trail. All ledger entries, signed.
        </Text>
        <View
          style={{
            marginTop: 12,
            flexDirection: 'row',
            backgroundColor: t.surface,
            borderRadius: 8,
            padding: 3,
            borderWidth: 1,
            borderColor: t.line,
            gap: 4,
          }}
        >
          <FilterBtn label="Yours" active={filter === 'mine'} onPress={() => setFilter('mine')} />
          <FilterBtn label="All members" active={filter === 'all'} onPress={() => setFilter('all')} />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : entries.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 13 }}>No ledger entries yet.</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}
          ItemSeparatorComponent={() => null}
          renderItem={({ item, index }) => (
            <LedgerRow entry={item} isLast={index === entries.length - 1} currency={league?.ledger.currencyLabel || '$'} />
          )}
          ListHeaderComponent={
            <View
              style={{
                backgroundColor: t.surface,
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: t.line,
              }}
            />
          }
          ListFooterComponent={
            <View
              style={{
                height: 4,
                backgroundColor: t.surface,
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: t.line,
              }}
            />
          }
        />
      )}
    </View>
  );
}

function FilterBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, padding: 7, borderRadius: 6, backgroundColor: active ? t.accent : 'transparent', alignItems: 'center' }}
    >
      <Text
        style={{
          color: active ? '#0E1116' : t.textDim,
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function LedgerRow({ entry, isLast, currency }: { entry: LedgerEntry; isLast: boolean; currency: string }) {
  const t = useTheme();
  const date = entry.createdAt instanceof Date ? entry.createdAt : (entry.createdAt as { toDate?: () => Date })?.toDate?.();
  const typeMap: Record<LedgerEntry['type'], 'buyin' | 'race_payout' | 'season_payout' | 'manual_adjust'> = {
    buy_in_pledge: 'buyin',
    race_payout: 'race_payout',
    season_payout: 'season_payout',
    manual_adjust: 'manual_adjust',
  };
  return (
    <View
      style={{
        padding: 14,
        backgroundColor: t.surface,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: isLast ? 1 : 0,
        borderColor: t.line,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <TypeBadge type={typeMap[entry.type]} />
        </View>
        <Text style={{ color: t.text, fontFamily: t.fSans, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
          {entry.description}
        </Text>
        {date ? (
          <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4 }}>
            {date.toLocaleDateString()}
          </Text>
        ) : null}
      </View>
      <CashFlowStat amount={entry.amount} size={15} prefix={currency} />
      <Separator isLast={isLast} />
    </View>
  );
}

function Separator({ isLast }: { isLast: boolean }) {
  const t = useTheme();
  if (isLast) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 14,
        right: 14,
        height: 1,
        backgroundColor: t.lineSoft,
      }}
    />
  );
}
