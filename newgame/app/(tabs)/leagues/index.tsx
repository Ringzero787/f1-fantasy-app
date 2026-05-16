import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { useTheme } from '@/theme';
import type { League } from '@/types';

export default function LeaguesIndexScreen() {
  const t = useTheme();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const list = await leagueService.getMyLeagues(userId);
      setLeagues(list);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', padding: 16, gap: 10 }}>
        <Pressable
          onPress={() => router.push('/(tabs)/leagues/create')}
          style={({ pressed }) => [
            {
              flex: 1,
              paddingVertical: 14,
              backgroundColor: t.accent,
              borderRadius: 10,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text style={{ color: '#0E1116', fontFamily: t.fSans, fontWeight: '700', fontSize: 13 }}>Create league</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(tabs)/leagues/join')}
          style={({ pressed }) => [
            {
              flex: 1,
              paddingVertical: 14,
              backgroundColor: 'transparent',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <Text
            style={{
              color: t.text,
              fontFamily: t.fMono,
              fontWeight: '600',
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            Join with code
          </Text>
        </Pressable>
      </View>

      {loading && leagues.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : leagues.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
          <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 18, fontWeight: '700' }}>No leagues yet.</Text>
          <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 13 }}>Create one and invite your friends.</Text>
        </View>
      ) : (
        <FlatList
          data={leagues}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={<RefreshControl tintColor={t.accent} refreshing={loading} onRefresh={reload} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <Link href={`/(tabs)/leagues/${item.id}`} asChild>
              <Pressable
                style={({ pressed }) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    backgroundColor: t.surface,
                    borderColor: t.line,
                    borderWidth: 1,
                    borderRadius: 12,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: t.text, fontFamily: t.fDisp, fontWeight: '600', fontSize: 16, letterSpacing: -0.3 }}>{item.name}</Text>
                  <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4 }}>
                    {item.memberCount} / {item.maxMembers} · code {item.inviteCode}
                  </Text>
                  {item.ledger.enabled ? (
                    <Text style={{ color: t.accent, fontFamily: t.fMono, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 }}>
                      Buy-in {item.ledger.currencyLabel}
                      {item.ledger.buyInAmount} · {labelForTemplate(item.ledger.payoutTemplate)}
                    </Text>
                  ) : null}
                </View>
                <Text style={{ color: t.textMute, fontSize: 18 }}>›</Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

function labelForTemplate(template: string) {
  switch (template) {
    case 'per_race':
      return 'Per-race payouts';
    case 'season_end':
      return 'Season-end pot';
    case 'hybrid':
      return 'Per-race + season-end';
    default:
      return 'Custom payouts';
  }
}
