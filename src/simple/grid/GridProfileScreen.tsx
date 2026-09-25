import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, Alert, ActivityIndicator, Image, StatusBar, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useLeagueStore } from '../../store/league.store';
import { usePrefsStore, type ThemeMode } from '../../store/prefs.store';
import { usePitWallStore } from '../../store/pitwall.store';
import { usePurchaseStore } from '../../store/purchase.store';
import { portalUrl } from '../../pitwall/client';
import { pitWallSurface } from '../../pitwall/config';
import { isAmazonBuild } from '../../utils/storeDetection';
import { useAdminStore } from '../../store/admin.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { authService } from '../../services/auth.service';
import * as notificationService from '../../services/notification.service';
import { generateAvatar } from '../../services/avatarGeneration.service';
import { RulesGuide } from '../../components/RulesGuide';
import { GridAvatar, MonoLabel, PillButton, ScreenHeader, SegmentPill } from './GridBits';
import { profileStatusLine } from './standings';
import { SHOWCASE_ENABLED } from './showcaseData';
import { teamRaceHistory, historyStats, scoredRaceCount } from './raceHistory';
import { S_DISPLAY_SCALES as DISPLAY_SCALES } from '../theme/simpleTheme';

const PRIVACY_URL = 'https://f1-app-18077.web.app/privacy.html';

// Profile (TRANSITION.md §4) with the folded-in rows from the old sheet (§1).
export function GridProfileScreen() {
  const { colors, family, spacing, scaled, mono, isDark } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);
  const { team, updateTeamName } = useSimpleTeam();
  const leagues = useLeagueStore((s) => s.leagues);
  const members = useLeagueStore((s) => s.members);
  const themeMode = usePrefsStore((s) => s.themeMode);
  const setThemeMode = usePrefsStore((s) => s.setThemeMode);
  const displayScale = usePrefsStore((s) => s.displayScale);
  const setDisplayScale = usePrefsStore((s) => s.setDisplayScale);
  const raceResults = useAdminStore((s) => s.raceResults);
  const races = useRemoteConfigStore((s) => s.races);
  const appConfig = useRemoteConfigStore((s) => s.appConfig);

  const [name, setName] = useState(user?.displayName ?? '');
  const [editingName, setEditingName] = useState(false);
  const [teamName, setTeamName] = useState(team?.name ?? '');
  const [editingTeam, setEditingTeam] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reminders, setReminders] = useState(true);

  useEffect(() => { if (!editingName) setName(user?.displayName ?? ''); }, [user?.displayName, editingName]);
  useEffect(() => { if (!editingTeam) setTeamName(team?.name ?? ''); }, [team?.name, editingTeam]);
  useEffect(() => {
    if (!user?.id || isDemoMode) return;
    notificationService.getIncompleteTeamReminderPref(user.id).then(setReminders).catch(() => {});
  }, [user?.id, isDemoMode]);

  const leagueId = team?.leagueId ?? null;
  const league = leagueId ? leagues.find((l) => l.id === leagueId) ?? null : null;
  const me = league ? members.find((m) => m.leagueId === league.id && m.userId === user?.id) : undefined;
  const seasonPoints = (team?.totalPoints ?? 0) + (team?.lockedPoints ?? 0);
  const history = useMemo(() => teamRaceHistory(team as never, raceResults as never, races), [team, raceResults, races]);
  const stats = useMemo(() => historyStats(history, seasonPoints, scoredRaceCount(team?.scoredRaces), team?.bestRacePoints ?? null), [history, seasonPoints, team]);
  const seasonLength = useMemo(() => {
    const id = races[races.length - 1]?.seasonId;
    return id ? races.filter((r) => r.seasonId === id).length : races.length;
  }, [races]);
  const seasonYear = races[races.length - 1]?.seasonId ?? String(new Date().getFullYear());
  const version = Constants.expoConfig?.version ?? '?';

  const commitName = async () => {
    setEditingName(false);
    const n = name.trim();
    if (!user || n === user.displayName) return;
    if (n.length < 2) { Alert.alert('Name', 'Use at least 2 characters.'); setName(user.displayName); return; }
    try {
      if (!isDemoMode) await authService.updateUserProfile(user.id, { displayName: n });
      setUser({ ...user, displayName: n });
    } catch { Alert.alert('Error', 'Could not update your name.'); setName(user.displayName); }
  };
  const commitTeamName = async () => {
    setEditingTeam(false);
    const n = teamName.trim();
    if (!team || n === team.name) return;
    if (n.length < 2) { Alert.alert('Team name', 'Use at least 2 characters.'); setTeamName(team.name); return; }
    try { await updateTeamName(n); } catch { Alert.alert('Error', 'Could not update the team name.'); setTeamName(team.name); }
  };

  const applyAvatar = useCallback(async (uri: string, upload: boolean) => {
    if (!user) return;
    setAvatarBusy(true);
    try {
      let url = uri;
      if (upload && !isDemoMode) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const { uploadProfileImage } = await import('../../services/profileImage.service');
        url = await uploadProfileImage(user.id, base64, 'image/jpeg');
      }
      if (!isDemoMode) await authService.updateUserProfile(user.id, { photoURL: url });
      setUser({ ...user, photoURL: url });
      setRecent((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, 6));
    } catch { Alert.alert('Error', 'Could not update your avatar.'); }
    finally { setAvatarBusy(false); }
  }, [user, isDemoMode, setUser]);

  const pickPhoto = useCallback(async () => {
    setAvatarOpen(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Photos', 'Allow photo access to pick an avatar.'); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (res.canceled || !res.assets[0]) return;
      await applyAvatar(res.assets[0].uri, true);
    } catch { Alert.alert('Error', 'Could not open your photos.'); }
  }, [applyAvatar]);

  const generate = useCallback(async () => {
    if (!user) return;
    setAvatarOpen(false);
    setAvatarBusy(true);
    try {
      const r = await generateAvatar(user.displayName || 'Player', 'user', user.id, 'detailed');
      if (r.success && r.imageUrl) await applyAvatar(r.imageUrl, false);
      else Alert.alert('Avatar', r.error || 'Generation failed. Try again later.');
    } catch { Alert.alert('Avatar', 'Generation failed.'); }
    finally { setAvatarBusy(false); }
  }, [user, applyAvatar]);

  const toggleReminders = async () => {
    const next = !reminders;
    setReminders(next);
    if (!user?.id || isDemoMode) return;
    try { await notificationService.setIncompleteTeamReminderPref(user.id, next); }
    catch { setReminders(!next); Alert.alert('Error', 'Could not update the reminder setting.'); }
  };

  const deleteAccount = () => {
    if (isDemoMode) { Alert.alert('Demo mode', 'Account deletion is not available in demo mode.'); return; }
    if (!user) return;
    Alert.alert('Delete account?', 'This permanently deletes your account and data. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await authService.deleteAccount(user.id); setUser(null); router.replace('/(auth)/login'); }
        catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete the account.'); }
      } },
    ]);
  };

  const doSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { try { await signOut(); } finally { clearPitWall(); router.replace('/(auth)/login'); } } },
    ]);
  };

  const gutter = spacing.xl;
  const row = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: scaled(20), borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 12 };
  const value = { fontFamily: family.ui.bold, fontSize: scaled(14), letterSpacing: -scaled(14) * 0.02, textTransform: 'uppercase' as const, color: colors.text.primary };
  const chevron = <Text style={{ color: colors.text.muted, fontSize: scaled(14) }}>›</Text>;
  const stackPills = displayScale > 1.15;
  const scaleKey = (DISPLAY_SCALES.find((s) => Math.abs(s.scale - displayScale) < 0.01) ?? DISPLAY_SCALES[1]).key;

  const pwPass = usePitWallStore((s) => s.pass);
  const refreshPitWall = usePitWallStore((s) => s.refresh);
  const clearPitWall = usePitWallStore((s) => s.clear);
  const [openingPortal, setOpeningPortal] = useState(false);

  // Placement, copy and whether the row appears at all come from config/app, so the surface can be
  // limited to a beta group or switched off without a store build (ARCHITECTURE section 8).
  const pwSurface = useMemo(
    () => pitWallSurface(
      (appConfig as unknown as Record<string, unknown>)?.pitwall,
      isAmazonBuild ? 'amazon' : Platform.OS === 'ios' ? 'ios' : 'android',
      { uid: user?.id ?? null, leagueId: league?.id ?? null, appVersion: version },
    ),
    [appConfig, user?.id, league?.id, version],
  );

  // Pit Wall is a website. The app hands the browser a single-use code so the same account is
  // already signed in when it opens; Amazon sign-in cannot be done in a browser at all.
  const openPitWall = useCallback(async () => {
    if (openingPortal) return;
    setOpeningPortal(true);
    try {
      const url = await portalUrl('profile', pwSurface?.url);
      await WebBrowser.openBrowserAsync(url, { controlsColor: colors.primary, toolbarColor: colors.surface });
      // A pass may have been bought while the browser was open; the claim needs a forced refresh.
      await refreshPitWall(true);
    } catch {
      Alert.alert('Pit Wall', 'Could not open Pit Wall. Check your connection and try again.');
    } finally {
      setOpeningPortal(false);
    }
  }, [openingPortal, colors.primary, colors.surface, refreshPitWall, pwSurface?.url]);

  // With mode 'iap' the pass is sold through the store, so the row starts a purchase instead of
  // opening the site. Everywhere else it opens the portal and the pass is bought on the web.
  const buyPass = usePurchaseStore((s) => s.purchasePitWallPass);
  const buying = usePurchaseStore((s) => s.isPurchasing);
  const sellsInApp = pwSurface?.mode === 'iap' && !pwPass.active;

  const passValue = buying && sellsInApp
    ? 'Opening store…'
    : sellsInApp
      ? 'Get the pass'
      : openingPortal
    ? 'Opening…'
    : pwPass.active && pwPass.expiresAt
      ? `${pwSurface?.pass ?? 'Pass'} to ${new Date(pwPass.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      : pwSurface?.free ?? 'Open';

  const LinkRow = ({ label, valueText, onPress, danger, accent }: { label: string; valueText?: string; onPress: () => void; danger?: boolean; accent?: boolean }) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [row, { opacity: pressed ? 0.7 : 1 }]}>
      <MonoLabel color={danger ? colors.primary : undefined}>{label}</MonoLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 }}>
        {valueText ? <Text numberOfLines={1} style={[value, { flexShrink: 1, color: accent ? colors.primary : danger ? colors.primary : colors.text.primary }]}>{valueText}</Text> : null}
        {chevron}
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 22 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ScreenHeader statusLeft="← BACK" onStatusLeftPress={() => router.back()} statusRight={`SEASON ${seasonYear}`} statusRightAccent={false} title="Profile" />

        {/* identity */}
        <View style={{ marginHorizontal: gutter, marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Pressable onPress={() => setAvatarOpen(true)} accessibilityRole="button" accessibilityLabel="Change avatar">
            {avatarBusy ? <View style={{ width: scaled(72), height: scaled(72), borderRadius: 999, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
              : <GridAvatar name={user?.displayName} imageUrl={user?.photoURL} size={72} />}
          </Pressable>
          <View style={{ gap: 6, flexShrink: 1 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: family.ui.black, fontSize: scaled(20), lineHeight: scaled(21), letterSpacing: -scaled(20) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{user?.displayName || 'Player'}</Text>
            <MonoLabel color={colors.primary} style={{ letterSpacing: scaled(11) * 0.14 }}>{isDemoMode && !SHOWCASE_ENABLED ? 'DEMO MODE' : profileStatusLine(me?.rank ?? null, league?.name ?? null)}</MonoLabel>
          </View>
        </View>

        <View style={{ marginHorizontal: gutter, marginTop: 28 }}>
          <View style={row}>
            <MonoLabel>NAME</MonoLabel>
            <TextInput value={name} onChangeText={setName} onFocus={() => setEditingName(true)} onBlur={commitName} onSubmitEditing={commitName} maxLength={30} returnKeyType="done" style={[value, { flex: 1, textAlign: 'right', paddingVertical: 0, minWidth: 0 }]} accessibilityLabel="Display name" />
          </View>
          <View style={row}>
            <MonoLabel>TEAM NAME</MonoLabel>
            <TextInput value={teamName} onChangeText={setTeamName} onFocus={() => setEditingTeam(true)} onBlur={commitTeamName} onSubmitEditing={commitTeamName} maxLength={30} returnKeyType="done" editable={!!team} style={[value, { flex: 1, textAlign: 'right', paddingVertical: 0, minWidth: 0 }]} accessibilityLabel="Team name" />
          </View>
          <LinkRow label="AVATAR" valueText={user?.photoURL ? 'Change' : 'Add'} onPress={() => setAvatarOpen(true)} />
          <LinkRow label="LEAGUE" valueText={league ? league.name : 'Join or create'} accent={!league} onPress={() => router.push('/(simple)/league-manager' as never)} />
          {pwSurface ? <LinkRow label={pwSurface.label} valueText={passValue} accent={pwPass.active || sellsInApp} onPress={sellsInApp ? () => void buyPass() : openPitWall} /> : null}
          {/* At large display sizes the pills stack under their labels so every segment stays on screen */}
          <View style={[row, stackPills && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <MonoLabel>APPEARANCE</MonoLabel>
            <SegmentPill<ThemeMode> value={themeMode} onChange={setThemeMode} size={10} padY={8} style={[{ padding: 3 }, stackPills ? null : { width: scaled(200) }]} segments={[{ key: 'system', label: 'AUTO' }, { key: 'dark', label: 'DARK' }, { key: 'light', label: 'LIGHT' }]} />
          </View>
          <View style={[row, stackPills && { flexDirection: 'column', alignItems: 'stretch' }]}>
            <MonoLabel>DISPLAY SIZE</MonoLabel>
            <SegmentPill value={scaleKey} onChange={(k) => setDisplayScale(DISPLAY_SCALES.find((s) => s.key === k)!.scale)} size={10} padY={8} style={[{ padding: 3 }, stackPills ? null : { width: scaled(230) }]} segments={DISPLAY_SCALES.map((s) => ({ key: s.key, label: s.key }))} />
          </View>
          <Pressable onPress={toggleReminders} accessibilityRole="switch" accessibilityState={{ checked: reminders }} style={({ pressed }) => [row, { opacity: pressed ? 0.7 : 1 }]}>
            <MonoLabel>TEAM REMINDERS</MonoLabel>
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: reminders ? colors.text.primary : colors.borderStrong, backgroundColor: reminders ? colors.text.primary : 'transparent', paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(10), letterSpacing: scaled(10) * 0.08, color: reminders ? colors.text.inverse : colors.text.muted }}>{reminders ? 'ON' : 'OFF'}</Text>
            </View>
          </Pressable>

          {/* stat cards */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            {[
              { label: 'RACES', value: String(stats.races), suffix: `/${seasonLength}` },
              { label: 'AVG / RACE', value: stats.avg == null ? '—' : stats.avg.toFixed(1) },
              { label: 'BEST', value: stats.best == null ? '—' : String(stats.best) },
            ].map((c) => (
              <View key={c.label} style={{ flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, paddingHorizontal: 12, gap: 6 }}>
                <MonoLabel size={10} style={{ letterSpacing: scaled(10) * 0.14 }}>{c.label}</MonoLabel>
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: family.ui.black, fontSize: scaled(22), lineHeight: scaled(23), letterSpacing: -scaled(22) * 0.04, color: colors.text.primary }}>
                  {c.value}{c.suffix ? <Text style={{ fontSize: scaled(12), color: colors.text.muted }}>{c.suffix}</Text> : null}
                </Text>
              </View>
            ))}
          </View>

          <View style={{ marginTop: 16 }}>
            <LinkRow label="GAME RULES" onPress={() => setRulesOpen(true)} />
            <Pressable onPress={() => setHistoryOpen((o) => !o)} accessibilityRole="button" style={({ pressed }) => [row, { opacity: pressed ? 0.7 : 1 }]}>
              <MonoLabel>RACE HISTORY</MonoLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={value}>{history.length ? `${history.length} RACES` : '—'}</Text>
                <Text style={{ color: colors.text.muted, fontSize: scaled(14) }}>{historyOpen ? '▾' : '›'}</Text>
              </View>
            </Pressable>
            {historyOpen && (
              <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
                {history.length === 0 ? <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>NO RACES SCORED YET.</Text> : history.map((h) => (
                  <View key={h.raceId} style={{ paddingVertical: 8, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: family.ui.bold, fontSize: scaled(12), textTransform: 'uppercase', color: colors.text.primary }}>RD {h.round} · {h.name}</Text>
                      <Text style={[mono(12), { color: h.total > 0 ? colors.positive : h.total < 0 ? colors.primary : colors.text.muted }]}>{h.total > 0 ? '+' : ''}{h.total}</Text>
                    </View>
                    <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>
                      {[...h.drivers.map((d) => `${d.shortName} ${d.pts}`), ...(h.constructor ? [`${h.constructor.name.toUpperCase()} ${h.constructor.pts}`] : [])].join(' · ')}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            <LinkRow label="PRIVACY POLICY" onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL, { controlsColor: colors.primary, toolbarColor: colors.surface })} />
            <LinkRow label="DELETE ACCOUNT" onPress={deleteAccount} danger />
          </View>

          <Text style={[mono(10, 'medium'), { color: colors.text.muted, marginTop: 16 }]}>UNDERCUT {version}</Text>
          <PillButton label="SIGN OUT" variant="outline" onPress={doSignOut} style={{ marginTop: 24 }} />
        </View>
      </ScrollView>

      {/* Avatar sheet */}
      <Modal visible={avatarOpen} transparent animationType="fade" onRequestClose={() => setAvatarOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={() => setAvatarOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: gutter, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 12 }}>
            <MonoLabel>AVATAR</MonoLabel>
            <PillButton label="GENERATE WITH AI" variant="primary" onPress={generate} />
            <PillButton label="CHOOSE FROM LIBRARY" variant="outline" onPress={pickPhoto} />
            {recent.length > 0 && (
              <View style={{ gap: 8, marginTop: 4 }}>
                <MonoLabel size={10}>RECENT</MonoLabel>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {recent.map((u) => (
                    <Pressable key={u} onPress={() => { setAvatarOpen(false); applyAvatar(u, false); }} accessibilityRole="button" accessibilityLabel="Use this avatar">
                      <Image source={{ uri: u }} style={{ width: scaled(48), height: scaled(48), borderRadius: 999 }} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            <Pressable onPress={() => setAvatarOpen(false)} style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.text.muted}>CANCEL</MonoLabel></Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <RulesGuide visible={rulesOpen} onClose={() => setRulesOpen(false)} />
    </SafeAreaView>
  );
}
