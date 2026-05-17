// League settings — commissioner-only controls.
//   - Toggle "Open to the public" (was previously create-only)
//   - Remove a member (warning)
//   - Delete the league (warning + double confirm)
//
// Reachable from the League Detail page via the gear button (owner only).

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { leagueService } from '@services/league.service';
import { avatarsService } from '@services/avatars.service';
import { HelmetAvatar } from '@components/HelmetAvatar';
import { SectionLabel } from '@components/tl';
import { useTheme } from '@/theme';
import type { League, LeagueMember } from '@/types';

export default function LeagueSettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((s) => s.user);

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [l, ms] = await Promise.all([leagueService.getLeague(id), leagueService.getMembers(id)]);
      setLeague(l);
      setMembers(ms);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  if (loading || !league) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const isOwner = user?.id === league.ownerId;
  if (!isOwner) {
    return (
      <SafeBg>
        <View style={[styles.center, { padding: 24 }]}>
          <Text style={{ color: t.text, fontFamily: t.fDisp, fontWeight: '700', fontSize: 18, textAlign: 'center' }}>
            Commissioner only.
          </Text>
          <Text style={{ marginTop: 8, color: t.textDim, fontFamily: t.fSans, fontSize: 13, textAlign: 'center' }}>
            League settings are managed by the league's commissioner.
          </Text>
        </View>
      </SafeBg>
    );
  }

  const onUploadAvatar = async () => {
    if (!league || busy) return;
    setBusy('avatar');
    try {
      const url = await avatarsService.pickAndUploadLeagueAvatar(league.id);
      if (url) setLeague({ ...league, avatarUrl: url });
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onTogglePublic = async (next: boolean) => {
    if (busy) return;
    setBusy('public');
    try {
      await leagueService.setLeaguePublic(league.id, next);
      setLeague({ ...league, isPublic: next });
    } catch (err) {
      Alert.alert('Could not update', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onRemoveMember = (m: LeagueMember) => {
    if (busy) return;
    Alert.alert(
      `Remove ${m.displayName}?`,
      `They'll lose access to "${league.name}" and disappear from the leaderboard. Their season scores stay intact — re-invite them anytime with the invite code.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(`member-${m.userId}`);
            try {
              await leagueService.removeMember({ leagueId: league.id, targetUserId: m.userId, requestedBy: user!.id });
              await reload();
            } catch (err) {
              Alert.alert('Could not remove', err instanceof Error ? err.message : 'Unknown error');
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  const onDeleteLeague = () => {
    Alert.alert(
      'Delete this league?',
      `"${league.name}" will be permanently removed for every member. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Double confirm — single tap is too easy.
            Alert.alert(
              'Are you sure?',
              `Type the league name to confirm in the next prompt would be safer, but for now: tap Delete once more if you really mean it.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete forever',
                  style: 'destructive',
                  onPress: async () => {
                    setBusy('delete');
                    try {
                      await leagueService.deleteLeague(league.id);
                      router.replace('/(tabs)/leagues');
                    } catch (err) {
                      Alert.alert('Could not delete', err instanceof Error ? err.message : 'Unknown error');
                    } finally {
                      setBusy(null);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeBg>
      <Stack.Screen options={{ title: 'League settings', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Header */}
        <Text
          style={{
            fontFamily: t.fMono,
            fontSize: 10,
            color: t.accent,
            letterSpacing: 1.6,
            textTransform: 'uppercase',
            fontWeight: '700',
          }}
        >
          {league.name}
        </Text>
        <Text
          style={{
            marginTop: 4,
            fontFamily: t.fDisp,
            fontSize: 24,
            fontWeight: '700',
            letterSpacing: -0.6,
            color: t.text,
          }}
        >
          Commissioner tools
        </Text>
        <Text style={{ marginTop: 6, fontFamily: t.fSans, fontSize: 13, color: t.textDim, lineHeight: 19 }}>
          Toggle league visibility, remove members, or delete the whole thing. Members can't see this page.
        </Text>

        {/* League avatar */}
        <SectionLabel trailing={league.avatarUrl ? 'CUSTOM' : 'DEFAULT'}>Avatar</SectionLabel>
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.line,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
              backgroundColor: t.surface2,
              borderWidth: 1,
              borderColor: t.line,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {league.avatarUrl ? (
              <Image source={{ uri: league.avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontFamily: t.fDisp, fontSize: 22, fontWeight: '800', color: t.textDim }}>
                {league.name.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' }}>
              League photo
            </Text>
            <Text style={{ marginTop: 4, fontFamily: t.fSans, fontSize: 12.5, color: t.textDim, lineHeight: 18 }}>
              Shown on the league card and detail page. Square photo works best.
            </Text>
          </View>
          <Pressable
            onPress={onUploadAvatar}
            disabled={busy === 'avatar'}
            style={({ pressed }) => [
              {
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: t.accent,
                opacity: busy === 'avatar' ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: '#0E1116', fontFamily: t.fMono, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {busy === 'avatar' ? 'Uploading…' : league.avatarUrl ? 'Replace' : 'Upload'}
            </Text>
          </Pressable>
        </View>

        {/* Public toggle */}
        <SectionLabel trailing={league.isPublic ? 'PUBLIC' : 'INVITE-ONLY'}>Visibility</SectionLabel>
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.line,
            padding: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.textMute, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' }}>
              Open to the public
            </Text>
            <Text style={{ marginTop: 4, fontFamily: t.fSans, fontSize: 12.5, color: t.textDim, lineHeight: 18 }}>
              When on, anyone can find this league in the Browse list and join without the invite code.
            </Text>
          </View>
          <Switch
            value={!!league.isPublic}
            onValueChange={onTogglePublic}
            disabled={busy === 'public'}
            trackColor={{ false: t.surface2, true: t.accentSoft }}
            thumbColor={league.isPublic ? t.accent : t.textDim}
          />
        </View>

        {/* Members */}
        <SectionLabel trailing={`${members.length} / ${league.maxMembers}`}>Members</SectionLabel>
        <View style={{ backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
          {members.map((m, i) => {
            const isOwnerRow = m.userId === league.ownerId;
            return (
              <View
                key={m.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderBottomWidth: i === members.length - 1 ? 0 : 1,
                  borderBottomColor: t.lineSoft,
                }}
              >
                <HelmetAvatar userId={m.userId} displayName={m.displayName} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ color: t.text, fontFamily: t.fSans, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
                      {m.displayName}
                    </Text>
                    {isOwnerRow ? (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: t.accentSoft, borderWidth: 1, borderColor: t.accentDim }}>
                        <Text style={{ fontFamily: t.fMono, fontSize: 9, fontWeight: '800', color: t.accent, letterSpacing: 0.8 }}>COMMISH</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ marginTop: 2, color: t.textMute, fontFamily: t.fMono, fontSize: 10, letterSpacing: 0.4 }}>
                    {m.totalPoints} pts · {m.raceWins} wins
                  </Text>
                </View>
                {isOwnerRow ? null : (
                  <Pressable
                    onPress={() => onRemoveMember(m)}
                    disabled={busy === `member-${m.userId}`}
                    style={({ pressed }) => [
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: t.danger,
                        opacity: busy === `member-${m.userId}` ? 0.5 : pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: t.danger, fontFamily: t.fMono, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      Remove
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        {/* Danger zone */}
        <SectionLabel>Danger zone</SectionLabel>
        <View
          style={{
            backgroundColor: t.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: t.danger,
            padding: 16,
            gap: 10,
          }}
        >
          <Text style={{ fontFamily: t.fMono, fontSize: 10, color: t.danger, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '700' }}>
            Delete league
          </Text>
          <Text style={{ fontFamily: t.fSans, fontSize: 12.5, color: t.textDim, lineHeight: 18 }}>
            Permanently removes "{league.name}" for everyone in it. Members lose access, the leaderboard disappears. Cannot be undone.
          </Text>
          <Pressable
            onPress={onDeleteLeague}
            disabled={busy === 'delete'}
            style={({ pressed }) => [
              {
                marginTop: 4,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: t.danger,
                alignItems: 'center',
                opacity: busy === 'delete' ? 0.5 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: '#fff', fontFamily: t.fMono, fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
              {busy === 'delete' ? 'Deleting…' : 'Delete league'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeBg>
  );
}

function SafeBg({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.bg }}>{children}</View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
