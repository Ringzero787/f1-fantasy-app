import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, Alert, Share, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { useSimpleTeam } from '../hooks/useSimpleTeam';
import { useAuthStore } from '../../store/auth.store';
import { useLeagueStore } from '../../store/league.store';
import { usePurchaseStore } from '../../store/purchase.store';
import { markDirty } from '../../utils/syncDirty';
import { useTeamStore } from '../../store/team.store';
import { useRemoteConfigStore } from '../../store/remoteConfig.store';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { DEFAULT_MAX_MEMBERS, MIN_LEAGUE_NAME_LENGTH, MAX_LEAGUE_NAME_LENGTH, SLOTS_PER_EXPANSION } from '../../config/constants';
import { MonoLabel, PillButton, ScreenHeader } from './GridBits';
import { playersCaption } from './standings';
import { expansionNext, callableErrorCode } from './expansionFallback';
import { PRODUCT_IDS, SLOTS_PER_PACK } from '../../config/products';
import { isAmazonBuild } from '../../utils/storeDetection';

export type ManagerStep = 'none' | 'join' | 'create' | 'done';
const MIN_CODE = 6;
const APP_URL = 'https://undercut.humannpc.com';

interface Props {
  initialStep?: 'none' | 'join' | 'create';
  /** Invite code from a join deep link */
  joinCode?: string;
}

// League Manager (TRANSITION.md §4): none → join | create → manage.
export function GridLeagueManager({ initialStep = 'none', joinCode }: Props) {
  const { colors, family, spacing, scaled, mono } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const userId = user?.id ?? '';
  const userName = user?.displayName ?? 'Player';
  const { team, assignTeamToLeague, syncToFirebase } = useSimpleTeam();
  const leagues = useLeagueStore((s) => s.leagues);
  const members = useLeagueStore((s) => s.members);
  const loadUserLeagues = useLeagueStore((s) => s.loadUserLeagues);
  const createLeague = useLeagueStore((s) => s.createLeague);
  const joinLeagueByCode = useLeagueStore((s) => s.joinLeagueByCode);
  const leaveLeague = useLeagueStore((s) => s.leaveLeague);
  const deleteLeague = useLeagueStore((s) => s.deleteLeague);
  const hasExpansionCredit = usePurchaseStore((s) => s.hasExpansionCredit);
  const consumeExpansionCredit = usePurchaseStore((s) => s.consumeExpansionCredit);
  // F-175: the slot pack is retired; only a credit already paid for can still be applied.
  const expansionCredits = usePurchaseStore((s) => s.pendingExpansionCredits);
  // Slot packs (owner decision 2026-11-25): +3 a pack, server-applied. The row shows only once the
  // store has priced the product, so nothing is offered before it exists in Play / App Store / Amazon.
  const storePrices = usePurchaseStore((s) => s.storePrices);
  const isPurchasingSlots = usePurchaseStore((s) => s.isPurchasing);
  const expandLeagueCapacity = useLeagueStore((s) => s.expandLeagueCapacity);
  const [expanding, setExpanding] = useState(false);

  const leagueId = team?.leagueId ?? null;
  const league = leagueId ? leagues.find((l) => l.id === leagueId) ?? null : leagues[0] ?? null;
  const isOwner = !!league && league.ownerId === userId;
  const memberCount = league ? Math.max(members.filter((m) => m.leagueId === league.id).length, league.memberCount || 0) : 0;

  const [step, setStep] = useState<ManagerStep>(initialStep);
  const [code, setCode] = useState(joinCode?.toUpperCase() ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => { if (userId) loadUserLeagues(userId); }, [userId, loadUserLeagues]);
  useEffect(() => { if (joinCode) { setCode(joinCode.toUpperCase()); setStep('join'); } }, [joinCode]);
  const effectiveStep: ManagerStep = league ? 'done' : step === 'done' ? 'none' : step;

  const goBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/(simple)' as never)), []);

  const attachTeam = useCallback(async (id: string) => {
    if (team) { await assignTeamToLeague(team.id, id); await syncToFirebase(); }
  }, [team, assignTeamToLeague, syncToFirebase]);

  const doJoin = useCallback(async () => {
    const c = code.trim().toUpperCase();
    if (c.length < MIN_CODE) return;
    setBusy(true); setError(null);
    try {
      await joinLeagueByCode(c, userId, userName);
      const joined = useLeagueStore.getState().currentLeague;
      if (joined) await attachTeam(joined.id);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join that league.');
    } finally { setBusy(false); }
  }, [code, userId, userName, joinLeagueByCode, attachTeam]);

  const doCreate = useCallback(async () => {
    const n = name.trim();
    if (n.length < MIN_LEAGUE_NAME_LENGTH) { setError(`Name needs at least ${MIN_LEAGUE_NAME_LENGTH} characters.`); return; }
    if (leagues.length > 0 && team?.leagueId) { setError('Leave your current league first.'); return; }
    setBusy(true); setError(null);
    try {
      const created = await createLeague(userId, userName, { name: n, isPublic: false, maxMembers: DEFAULT_MAX_MEMBERS }, useRemoteConfigStore.getState().getCurrentSeasonId());
      if (created) await attachTeam(created.id);
      setName('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create the league.';
      setError(msg.includes('permission') ? 'Could not create the league. Try again.' : msg);
    } finally { setBusy(false); }
  }, [name, leagues.length, team?.leagueId, createLeague, userId, userName, attachTeam]);

  // Code + the join link the app's deep-link handler accepts (app/_layout.tsx).
  const inviteMessage = league
    ? `Join my Undercut league "${league.name}"!\n\nInvite code: ${league.inviteCode}\nTap to join: ${APP_URL}/join?code=${league.inviteCode}\n\nGet the app: ${APP_URL}`
    : '';

  const copyCode = useCallback(async () => {
    if (!league) return;
    try { await Clipboard.setStringAsync(league.inviteCode); } catch {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [league]);

  const smsInvite = useCallback(async () => {
    if (!league) return;
    const sep = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${sep}body=${encodeURIComponent(inviteMessage)}`;
    try {
      if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; }
    } catch {}
    try { await Share.share({ message: inviteMessage }); } catch {}
  }, [league, inviteMessage]);

  const sendEmail = useCallback(async () => {
    if (!league) return;
    const e = email.trim();
    if (!e.includes('@')) { Alert.alert('Invalid email', 'Enter a valid email address.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, `leagues/${league.id}/invites`), { email: e, status: 'pending', sentBy: userId, createdAt: new Date().toISOString() });
      setEmail(''); setEmailOpen(false);
      Alert.alert('Invite sent', `We emailed ${e} an invite.`);
    } catch { Alert.alert('Error', 'Failed to send the invite. Try again.'); }
    finally { setBusy(false); }
  }, [league, email, userId]);

  // Creator-only: apply a slot pack the owner already paid for. The pack is no
  // longer sold (F-175), so there is no purchase here: no credit, nothing to do.
  const expand = useCallback(async () => {
    if (!league || !isOwner || expanding || !hasExpansionCredit()) return;
    setExpanding(true);
    let spent = false;
    try {
      spent = consumeExpansionCredit();
      // Server path first (F-059): spends one store-verified purchase in a
      // transaction. Falls back to the direct write so a paying customer is
      // never left without their slots if validation is unavailable.
      let appliedByServer = false;
      if (!isDemoMode) {
        const before = league.maxMembers;
        try {
          await httpsCallable(functions, 'applyLeagueExpansion')({ leagueId: league.id });
          appliedByServer = true;
        } catch (e) {
          // The call may have committed even though its reply was lost, so look
          // before deciding; expansionNext documents which refusals never fall back.
          console.warn('[league] applyLeagueExpansion did not confirm:', e);
          await useLeagueStore.getState().loadLeague(league.id).catch(() => {});
          const now = useLeagueStore.getState().currentLeague;
          const grew = !!now && now.id === league.id && now.maxMembers > before;
          const next = expansionNext(callableErrorCode(e), grew);
          if (next === 'fail') throw e;
          appliedByServer = next === 'done';
        }
        if (appliedByServer) {
          await useLeagueStore.getState().loadLeague(league.id).catch(() => {});
          await loadUserLeagues(userId);
        }
      }
      if (!appliedByServer) await expandLeagueCapacity(league.id, SLOTS_PER_EXPANSION);
      spent = false;
      Alert.alert('League expanded', `${SLOTS_PER_EXPANSION} more players can join.`);
    } catch (e) {
      // The slots were not added, so the credit goes back: the pack cannot be bought again (F-175).
      if (spent) usePurchaseStore.getState().restoreExpansionCredit();
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add the extra slots.');
    } finally {
      setExpanding(false);
    }
  }, [league, isOwner, expanding, hasExpansionCredit, isDemoMode, consumeExpansionCredit, expandLeagueCapacity, loadUserLeagues, userId]);

  const leagueChartered = !!league && league.chartered === true && typeof league.charter?.expiresAt === 'number' && league.charter.expiresAt > Date.now();
  const slotSku = leagueChartered && !isAmazonBuild ? PRODUCT_IDS.SLOT_PACK_CHARTER : PRODUCT_IDS.SLOT_PACK;
  const slotPrice = storePrices[slotSku];
  const buySlots = useCallback(() => {
    if (!league || !isOwner) return;
    Alert.alert(
      `Add ${SLOTS_PER_PACK} slots for ${slotPrice}?`,
      leagueChartered
        ? `${league.name} grows to ${(league.maxMembers ?? DEFAULT_MAX_MEMBERS) + SLOTS_PER_PACK} players, and everyone you approve gets Pit Wall.`
        : `${league.name} grows to ${(league.maxMembers ?? DEFAULT_MAX_MEMBERS) + SLOTS_PER_PACK} players.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Buy', onPress: () => { void usePurchaseStore.getState().purchaseSlotPack(league.id, leagueChartered); } },
      ],
    );
  }, [league, isOwner, leagueChartered, slotPrice]);

  const confirmExpand = useCallback(() => {
    Alert.alert('Apply your slot pack?', `Adds ${SLOTS_PER_EXPANSION} member slots to ${league?.name ?? 'this league'}. A pack can be applied once.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Apply', onPress: () => { void expand(); } },
    ]);
  }, [league, expand]);

  const detachTeam = useCallback(async () => {
    const cur = useTeamStore.getState().currentTeam;
    if (cur) { useTeamStore.getState().setCurrentTeam(markDirty({ ...cur, leagueId: null, updatedAt: new Date() }, ['leagueId'])); await syncToFirebase(); }
  }, [syncToFirebase]);

  const leaveOrDelete = useCallback(() => {
    if (!league) return;
    if (isOwner) {
      Alert.alert('Delete league?', `"${league.name}" and its standings go away for everyone. This can't be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteLeague(league.id, userId); await detachTeam(); setStep('none'); }
          catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete the league.'); }
        } },
      ]);
    } else {
      Alert.alert('Leave league?', `Your team switches to solo play. Points and roster are kept; you can rejoin with a code.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: async () => {
          try { await leaveLeague(league.id, userId); await detachTeam(); setStep('none'); }
          catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed to leave the league.'); }
        } },
      ]);
    }
  }, [league, isOwner, deleteLeague, leaveLeague, userId, detachTeam]);

  const copy = useMemo(() => ({
    none: { status: 'NO LEAGUE', title: 'Your league', sub: "You're racing solo right now. Play against friends by creating a league or joining one with a code." },
    join: { status: 'JOIN', title: 'Enter code', sub: 'Ask the league owner for their invite code.' },
    create: { status: 'CREATE', title: 'New league', sub: 'You can rename it later from your profile.' },
    done: { status: 'MANAGE', title: league?.name ?? '', sub: isOwner ? 'You own this league. Share the code to invite friends.' : 'You joined this league. Share the code to bring more friends in.' },
  })[effectiveStep], [effectiveStep, league?.name, isOwner]);

  const gutter = spacing.xl;
  const inputStyle = { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: scaled(18), color: colors.text.primary } as const;
  const rowStyle = { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, paddingVertical: scaled(18), borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 12 };
  const rowValue = { fontFamily: family.ui.bold, fontSize: scaled(13), letterSpacing: -scaled(13) * 0.02, textTransform: 'uppercase' as const, color: colors.text.primary };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) + 22, flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <ScreenHeader statusLeft="← BACK" onStatusLeftPress={goBack} statusRight={copy.status} statusRightAccent={false} title={copy.title}>
        <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted, marginTop: 4 }}>{copy.sub}</Text>
      </ScreenHeader>

      <View style={{ flex: 1, paddingHorizontal: gutter, paddingTop: 28, gap: 12 }}>
        {effectiveStep === 'none' && (
          <>
            <Pressable onPress={() => setStep('create')} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: colors.card, borderRadius: 18, padding: 22, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: family.ui.black, fontSize: scaled(18), letterSpacing: -scaled(18) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>Create a league</Text>
                <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>You run it. Invite friends.</Text>
              </View>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(22), color: colors.primary }}>+</Text>
            </Pressable>
            <Pressable onPress={() => setStep('join')} accessibilityRole="button" style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 18, padding: 22, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
              <View style={{ gap: 6 }}>
                <Text style={{ fontFamily: family.ui.black, fontSize: scaled(18), letterSpacing: -scaled(18) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>Join a league</Text>
                <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>Got a code? Enter it.</Text>
              </View>
              <Text style={{ fontFamily: family.ui.black, fontSize: scaled(18), color: colors.text.muted }}>›</Text>
            </Pressable>
          </>
        )}

        {effectiveStep === 'join' && (
          <>
            <View style={{ gap: 8 }}>
              <MonoLabel>LEAGUE CODE</MonoLabel>
              <TextInput
                value={code}
                onChangeText={(t) => { setCode(t.toUpperCase()); setError(null); }}
                placeholder="XXX-0000"
                placeholderTextColor={colors.text.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                style={[inputStyle, { fontFamily: family.mono.bold, fontSize: scaled(22), letterSpacing: scaled(22) * 0.12 }]}
                accessibilityLabel="League code"
              />
            </View>
            {error ? <Text style={[mono(11), { color: colors.primary }]}>{error.toUpperCase()}</Text> : null}
            <PillButton label={busy ? 'JOINING…' : 'JOIN LEAGUE'} variant={code.trim().length >= MIN_CODE ? 'primary' : 'muted'} disabled={busy || code.trim().length < MIN_CODE} onPress={doJoin} style={{ marginTop: 8 }} />
            <Pressable onPress={() => { setStep('none'); setError(null); }} style={{ alignItems: 'center', paddingVertical: 12 }}><MonoLabel color={colors.text.muted}>BACK</MonoLabel></Pressable>
          </>
        )}

        {effectiveStep === 'create' && (
          <>
            <View style={{ gap: 8 }}>
              <MonoLabel>LEAGUE NAME</MonoLabel>
              <TextInput
                value={name}
                onChangeText={(t) => { setName(t); setError(null); }}
                placeholder="Paddock Pals"
                placeholderTextColor={colors.text.muted}
                maxLength={MAX_LEAGUE_NAME_LENGTH}
                style={[inputStyle, { fontFamily: family.ui.bold, fontSize: scaled(16) }]}
                accessibilityLabel="League name"
              />
            </View>
            <Text style={[mono(10, 'medium'), { color: colors.text.muted }]}>UP TO {DEFAULT_MAX_MEMBERS} PLAYERS. ADD MORE ANY TIME FROM THE LEAGUE PAGE.</Text>
            {error ? <Text style={[mono(11), { color: colors.primary }]}>{error.toUpperCase()}</Text> : null}
            <PillButton label={busy ? 'CREATING…' : 'CREATE LEAGUE'} variant={name.trim().length >= MIN_LEAGUE_NAME_LENGTH ? 'primary' : 'muted'} disabled={busy || name.trim().length < MIN_LEAGUE_NAME_LENGTH} onPress={doCreate} style={{ marginTop: 8 }} />
            <Pressable onPress={() => { setStep('none'); setError(null); }} style={{ alignItems: 'center', paddingVertical: 12 }}><MonoLabel color={colors.text.muted}>BACK</MonoLabel></Pressable>
          </>
        )}

        {effectiveStep === 'done' && league && (
          <>
            <View style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary, borderRadius: 18, padding: 22, paddingHorizontal: 20, gap: 10 }}>
              <MonoLabel color={colors.primary}>INVITE CODE</MonoLabel>
              <Text selectable style={{ fontFamily: family.mono.bold, fontSize: scaled(34), lineHeight: scaled(36), letterSpacing: scaled(34) * 0.08, color: colors.text.primary }}>{league.inviteCode}</Text>
              <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>{playersCaption(memberCount, league.maxMembers)}{memberCount <= 1 ? ' · JUST YOU SO FAR' : ''}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <SquareButton label="EMAIL" onPress={() => setEmailOpen(true)} />
              <SquareButton label="SMS" onPress={smsInvite} />
              <SquareButton label={copied ? 'COPIED' : 'COPY'} onPress={copyCode} inverse />
            </View>
            <View style={{ marginTop: 12 }}>
              <View style={rowStyle}><MonoLabel>NAME</MonoLabel><Text numberOfLines={1} style={[rowValue, { flexShrink: 1 }]}>{league.name}</Text></View>
              <View style={rowStyle}><MonoLabel>PLAYERS</MonoLabel><Text style={rowValue}>{memberCount} / {league.maxMembers}</Text></View>
              <View style={rowStyle}><MonoLabel>OWNER</MonoLabel><Text numberOfLines={1} style={[rowValue, { flexShrink: 1 }]}>{isOwner ? 'You' : league.ownerName}</Text></View>
              {isOwner && !isDemoMode && !!slotPrice && (
                <Pressable onPress={buySlots} disabled={isPurchasingSlots} accessibilityRole="button" accessibilityLabel={`Add ${SLOTS_PER_PACK} member slots for ${slotPrice}`} style={({ pressed }) => [rowStyle, { opacity: pressed || isPurchasingSlots ? 0.7 : 1 }]}>
                  <MonoLabel>LEAGUE SIZE</MonoLabel>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={rowValue}>{`+${SLOTS_PER_PACK} · ${slotPrice}`}</Text>
                    <Text style={{ color: colors.text.muted, fontSize: scaled(14) }}>›</Text>
                  </View>
                </Pressable>
              )}
              {isOwner && expansionCredits > 0 && (
                <Pressable onPress={confirmExpand} disabled={expanding} accessibilityRole="button" accessibilityLabel={`Apply your slot pack: ${SLOTS_PER_EXPANSION} more member slots`} style={({ pressed }) => [rowStyle, { opacity: pressed || expanding ? 0.7 : 1 }]}>
                  <MonoLabel>SLOT PACK</MonoLabel>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Text style={rowValue}>{expanding ? 'ADDING…' : `+${SLOTS_PER_EXPANSION} · APPLY`}</Text>
                    <Text style={{ color: colors.text.muted, fontSize: scaled(14) }}>›</Text>
                  </View>
                </Pressable>
              )}
            </View>
            <Pressable onPress={leaveOrDelete} accessibilityRole="button" style={{ marginTop: 'auto', alignItems: 'center', paddingVertical: 14 }}>
              <MonoLabel color={colors.primary} style={{ letterSpacing: scaled(11) * 0.14 }}>{isOwner ? 'DELETE LEAGUE' : 'LEAVE LEAGUE'}</MonoLabel>
            </Pressable>
          </>
        )}
      </View>

      {/* Email invite */}
      <Modal visible={emailOpen} transparent animationType="fade" onRequestClose={() => setEmailOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={() => setEmailOpen(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border, padding: gutter, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 12 }}>
            <MonoLabel>INVITE BY EMAIL</MonoLabel>
            <TextInput value={email} onChangeText={setEmail} placeholder="friend@example.com" placeholderTextColor={colors.text.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={[inputStyle, { fontFamily: family.mono.medium, fontSize: scaled(15) }]} accessibilityLabel="Email address" />
            <PillButton label={busy ? 'SENDING…' : 'SEND INVITE'} variant="primary" disabled={busy} onPress={sendEmail} />
            <Pressable onPress={() => setEmailOpen(false)} style={{ alignItems: 'center', paddingVertical: 8 }}><MonoLabel color={colors.text.muted}>CANCEL</MonoLabel></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function SquareButton({ label, onPress, inverse }: { label: string; onPress: () => void; inverse?: boolean }) {
  const { colors, family, scaled } = useSimpleTheme();
  const fontSize = scaled(11);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, paddingVertical: scaled(16), borderRadius: 14, alignItems: 'center', backgroundColor: inverse ? colors.text.primary : colors.card, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ fontFamily: family.ui.black, fontSize, letterSpacing: fontSize * 0.08, color: inverse ? colors.text.inverse : colors.text.primary }}>{label}</Text>
    </Pressable>
  );
}
