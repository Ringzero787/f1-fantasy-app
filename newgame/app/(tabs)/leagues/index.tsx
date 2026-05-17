// Leagues tab — Mine + Browse.
// Two segmented modes:
//   "Mine"   → leagues the user is in (createLeague / joinByInviteCode result)
//   "Browse" → public leagues (isPublic=true) with a search box for fuzzy
//              filtering by name / description / owner

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { useTheme } from '@/theme';
import { CONSTRUCTOR_COLORS } from '@/theme/tokens';
import type { League } from '@/types';

// Pick a stable accent color from the league name so each league has its own
// identifying stripe — borrows the constructor palette since it's already on
// the page tokens.
function accentForLeague(name: string): string {
  const PALETTE = Object.values(CONSTRUCTOR_COLORS) as string[];
  if (PALETTE.length === 0) return '#7C9CFF';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

type Mode = 'mine' | 'browse';

export default function LeaguesIndexScreen() {
  const t = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const [mode, setMode] = useState<Mode>('mine');
  const [mine, setMine] = useState<League[]>([]);
  const [browse, setBrowse] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [joining, setJoining] = useState<string | null>(null);

  const reloadMine = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      setMine(await leagueService.getMyLeagues(userId));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const reloadBrowse = useCallback(async () => {
    setLoading(true);
    try {
      setBrowse(await leagueService.browsePublic({ search: search.trim() || undefined }));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      if (mode === 'mine') reloadMine();
      else reloadBrowse();
    }, [mode, reloadMine, reloadBrowse])
  );

  useEffect(() => {
    if (mode === 'browse') reloadBrowse();
  }, [mode, reloadBrowse]);

  const myLeagueIds = useMemo(() => new Set(mine.map((l) => l.id)), [mine]);

  const onJoinPublic = async (l: League) => {
    if (!user) return;
    setJoining(l.id);
    try {
      await leagueService.joinPublic({ leagueId: l.id, userId: user.id, displayName: user.displayName });
      // Refresh both views.
      await Promise.all([reloadMine(), reloadBrowse()]);
      router.push(`/(tabs)/leagues/${l.id}`);
    } catch (err) {
      Alert.alert('Could not join', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setJoining(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Top actions */}
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

      {/* Mine / Browse segmented toggle */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: t.surface,
            borderRadius: 10,
            padding: 3,
            borderWidth: 1,
            borderColor: t.line,
            gap: 3,
          }}
        >
          {(['mine', 'browse'] as const).map((m) => {
            const active = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: active ? t.accent : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: active ? '#0E1116' : t.textDim,
                    fontFamily: t.fSans,
                    fontWeight: '600',
                    fontSize: 13,
                  }}
                >
                  {m === 'mine' ? 'Mine' : 'Browse public'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Search box (browse mode only) */}
      {mode === 'browse' ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={reloadBrowse}
            placeholder="Search public leagues by name, vibe, or owner…"
            placeholderTextColor={t.textMute}
            style={{
              backgroundColor: t.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: t.line,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: t.text,
              fontFamily: t.fSans,
              fontSize: 14.5,
            }}
            returnKeyType="search"
          />
        </View>
      ) : null}

      {/* List */}
      {loading && (mode === 'mine' ? mine : browse).length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : mode === 'mine' && mine.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
          <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 18, fontWeight: '700' }}>No leagues yet.</Text>
          <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 13 }}>Create one, join with a code, or browse public.</Text>
        </View>
      ) : mode === 'browse' && browse.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
          <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 18, fontWeight: '700' }}>
            {search ? 'No matches.' : 'No public leagues yet.'}
          </Text>
          <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 13, textAlign: 'center', maxWidth: 280 }}>
            {search ? 'Try a different search term, or create one of your own.' : 'Be the first to make one. Toggle "Open to the public" when you create.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={mode === 'mine' ? mine : browse}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              tintColor={t.accent}
              refreshing={loading}
              onRefresh={mode === 'mine' ? reloadMine : reloadBrowse}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <LeagueCard
              league={item}
              mode={mode}
              alreadyIn={myLeagueIds.has(item.id)}
              joining={joining === item.id}
              onJoin={() => onJoinPublic(item)}
            />
          )}
        />
      )}
    </View>
  );
}

// Rich league card. Borrows the Lineup-tile pattern: colored top stripe
// derived from the league name, big initial badge on the left, display
// heading + supporting stats, and a footer chip row for ledger / public.
function LeagueCard({
  league,
  mode,
  alreadyIn,
  joining,
  onJoin,
}: {
  league: League;
  mode: Mode;
  alreadyIn: boolean;
  joining: boolean;
  onJoin: () => void;
}) {
  const t = useTheme();
  const accent = accentForLeague(league.name);
  const initials = league.name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const fill = Math.min(1, league.memberCount / Math.max(1, league.maxMembers));
  const full = league.memberCount >= league.maxMembers;

  const body = (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.line,
        overflow: 'hidden',
      }}
    >
      {/* Top color stripe — identifies the league at a glance */}
      <View style={{ height: 4, backgroundColor: accent }} />
      <View style={{ padding: 14, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        {/* Initial badge */}
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 12,
            backgroundColor: `${accent}26`,
            borderWidth: 1.5,
            borderColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: t.fDisp, fontWeight: '800', fontSize: 18, color: accent, letterSpacing: -0.2 }}>
            {initials || 'TL'}
          </Text>
        </View>
        {/* Text block */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text
              style={{
                color: t.text,
                fontFamily: t.fDisp,
                fontWeight: '700',
                fontSize: 18,
                letterSpacing: -0.4,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {league.name}
            </Text>
            {league.isPublic ? <PublicBadge /> : null}
          </View>
          {league.description ? (
            <Text
              style={{
                marginTop: 4,
                color: t.textDim,
                fontFamily: t.fSans,
                fontSize: 12.5,
                lineHeight: 17,
              }}
              numberOfLines={2}
            >
              {league.description}
            </Text>
          ) : null}
          <Text style={{ marginTop: 6, color: t.textMute, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4 }}>
            {mode === 'browse' ? `run by ${league.ownerName}` : `code ${league.inviteCode}`}
          </Text>
        </View>
        {/* Trailing CTA / chevron */}
        {mode === 'browse' && !alreadyIn ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onJoin();
            }}
            disabled={joining || full}
            style={({ pressed }) => [
              {
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 9,
                backgroundColor: t.accent,
                alignSelf: 'center',
                opacity: full ? 0.4 : joining ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {joining ? 'Joining…' : full ? 'Full' : 'Join'}
            </Text>
          </Pressable>
        ) : (
          <Text style={{ color: t.textMute, fontSize: 22, alignSelf: 'center' }}>›</Text>
        )}
      </View>

      {/* Footer — member count bar + chips */}
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 0,
          paddingBottom: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '700', color: t.textMute, letterSpacing: 1, textTransform: 'uppercase' }}>
            Members
          </Text>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.surface2, overflow: 'hidden' }}>
            <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: accent }} />
          </View>
          <Text style={{ fontFamily: t.fMono, fontSize: 11, fontWeight: '800', color: t.text, fontVariant: ['tabular-nums'] }}>
            {league.memberCount} / {league.maxMembers}
          </Text>
        </View>
        {league.ledger.enabled ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Chip color={t.accent} backgroundColor={t.accentSoft}>
              Buy-in {league.ledger.currencyLabel}
              {league.ledger.buyInAmount}
            </Chip>
            <Chip color={t.textDim}>{labelForTemplate(league.ledger.payoutTemplate)}</Chip>
          </View>
        ) : (
          <View style={{ flexDirection: 'row' }}>
            <Chip color={t.textDim}>Bragging rights only</Chip>
          </View>
        )}
      </View>
    </View>
  );

  // Mine + browse-when-already-in are tappable to the detail. Browse-when-not-in
  // keeps the body non-tappable so the dedicated Join button is the primary action.
  if (mode === 'mine' || alreadyIn) {
    return (
      <Link href={`/(tabs)/leagues/${league.id}`} asChild>
        <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.92 : 1 })}>{body}</Pressable>
      </Link>
    );
  }
  return body;
}

function Chip({
  color,
  backgroundColor,
  children,
}: {
  color: string;
  backgroundColor?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: backgroundColor ?? 'transparent',
        borderWidth: backgroundColor ? 0 : 1,
        borderColor: t.line,
      }}
    >
      <Text style={{ fontFamily: t.fMono, fontSize: 10, fontWeight: '700', color, letterSpacing: 0.6 }}>{children}</Text>
    </View>
  );
}

function PublicBadge() {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: 4,
        backgroundColor: t.accentSoft,
        borderWidth: 1,
        borderColor: t.accentDim,
      }}
    >
      <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: t.accent, letterSpacing: 0.8 }}>
        PUBLIC
      </Text>
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
