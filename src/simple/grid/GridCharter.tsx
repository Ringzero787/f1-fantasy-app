/**
 * Charter in the grid (F-175 slice 4): the red square, the owner's cards, the ceremony, the
 * joiner's unlock sheet and the owner's request sheet. Copy is fixed by docs/design/charter/BUILD.md
 * ("App UI"); prices come from the store, never from this file.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';
import { CHARTER_RED, charterShareText, requestCaption } from './charter';
import { shareText } from './shareText';
import { usePurchaseStore } from '../../store/purchase.store';
import { useLeagueStore } from '../../store/league.store';
import { useAuthStore } from '../../store/auth.store';
import { leagueService } from '../../services/league.service';
import type { League, LeagueMember } from '../../types';

/** How long the ceremony waits for its league to load before it is dropped. */
const CEREMONY_WAIT_MS = 8000;

/** Share the owner's charter text (ceremony and the "PIT WALL · ON" card). */
export async function shareCharter(league: Pick<League, 'name' | 'inviteCode'>, ownerName: string): Promise<void> {
  await shareText(charterShareText(league.name, ownerName, league.inviteCode), `${league.name} is chartered`, 'charter');
}

/** The owner's "N REQUESTS TO JOIN · REVIEW ›" row (league page and League Manager). */
export function CharterRequestRow({ count, onPress }: { count: number; onPress: () => void }) {
  const { colors, scaled } = useSimpleTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${count} ${count === 1 ? 'request' : 'requests'} to join`}
      style={({ pressed }) => ({ paddingVertical: scaled(13), paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: CHARTER_RED, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
      <MonoLabel color={colors.text.primary}>{`${count} ${count === 1 ? 'REQUEST' : 'REQUESTS'} TO JOIN`}</MonoLabel>
      <MonoLabel color={CHARTER_RED}>REVIEW ›</MonoLabel>
    </Pressable>
  );
}

/** The 8px red square after a chartered league's name, everywhere the name is shown. */
export function CharterSquare({ size = 8 }: { size?: number }) {
  const { scaled } = useSimpleTheme();
  const s = scaled(size);
  return <View accessible accessibilityLabel="Charter" style={{ width: s, height: s, borderRadius: Math.max(2, s * 0.25), backgroundColor: CHARTER_RED }} />;
}

function CharterButton({ label, onPress, disabled, muted }: { label: string; onPress: () => void; disabled?: boolean; muted?: boolean }) {
  const { colors, family, scaled } = useSimpleTheme();
  const fontSize = scaled(12);
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({ flex: 1, paddingVertical: scaled(15), borderRadius: 14, alignItems: 'center', backgroundColor: muted ? colors.card : CHARTER_RED, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 })}>
      <Text style={{ fontFamily: family.ui.black, fontSize, letterSpacing: fontSize * 0.08, color: muted ? colors.text.primary : '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useSimpleTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: CHARTER_RED, borderRadius: 18, padding: 20, gap: 10, backgroundColor: colors.background }}>
      <MonoLabel color={CHARTER_RED}>{label}</MonoLabel>
      {children}
    </View>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  const { colors, family, scaled } = useSimpleTheme();
  return <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(13), lineHeight: scaled(19), color: colors.text.primary }}>{children}</Text>;
}

/** Owner, league not chartered, offer on: above the standings. */
export function CharterOfferCard({ leagueName, price, onUnlock, busy }: { leagueName: string; price: string; onUnlock: () => void; busy?: boolean }) {
  return (
    <Card label="PIT WALL IS NOT INCLUDED">
      <Body>{`Unlock it for everyone in ${leagueName} for the season. ${price}.`}</Body>
      <View style={{ flexDirection: 'row' }}><CharterButton label={busy ? 'OPENING…' : 'UNLOCK FOR THE LEAGUE'} onPress={onUnlock} disabled={busy} /></View>
    </Card>
  );
}

/** Owner, chartered: replaces the offer card. */
export function CharterOnCard({ leagueName, onShare }: { leagueName: string; onShare: () => void }) {
  return (
    <Card label="PIT WALL · ON">
      <Body>{`You unlocked it for ${leagueName}.`}</Body>
      <View style={{ flexDirection: 'row' }}><CharterButton label="SHARE" onPress={onShare} /></View>
    </Card>
  );
}

/** Everyone else in a chartered league: one line under the standings header, no price. */
export function CharterMemberLine({ ownerName }: { ownerName: string }) {
  return <MonoLabel color={CHARTER_RED}>{`PIT WALL ON · ${ownerName.toUpperCase()} PAID`}</MonoLabel>;
}

/** The create step's option, under the name field. Off by default. */
export function CharterCreateOption({ on, price, onToggle }: { on: boolean; price: string; onToggle: () => void }) {
  const { colors, family, scaled } = useSimpleTheme();
  return (
    <Pressable onPress={onToggle} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={`Unlock Pit Wall, ${price} for the season`}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: on ? CHARTER_RED : colors.border, borderRadius: 18, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flex: 1, gap: 6 }}>
        <MonoLabel color={on ? CHARTER_RED : colors.text.primary}>UNLOCK PIT WALL</MonoLabel>
        <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(12), lineHeight: scaled(18), color: colors.text.muted }}>{`${price} for the season. Every player you add gets it. Your name is on it.`}</Text>
      </View>
      <View style={{ width: scaled(22), height: scaled(22), borderRadius: 6, borderWidth: 2, borderColor: on ? CHARTER_RED : colors.borderStrong, backgroundColor: on ? CHARTER_RED : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Text style={{ color: '#FFFFFF', fontFamily: family.ui.black, fontSize: scaled(13) }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const { colors, spacing } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* the scrim and the sheet are siblings so iOS scrolls and taps the sheet, not the scrim */}
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 2, borderColor: CHARTER_RED, padding: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 22, gap: 14 }}>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function SheetTitle({ children }: { children: string }) {
  const { colors, family, scaled } = useSimpleTheme();
  return <Text accessibilityRole="header" style={{ fontFamily: family.ui.black, fontSize: scaled(26), lineHeight: scaled(27), letterSpacing: -scaled(26) * 0.03, textTransform: 'uppercase', color: colors.text.primary }}>{children}</Text>;
}

/**
 * The owner's ceremony, once, right after a successful Charter purchase on this device. Mounted
 * once in the grid layout so it shows wherever the purchase finished (the create step or the league page).
 */
export function GridCharterCeremonyHost() {
  const leagueId = usePurchaseStore((s) => s.charterCeremonyLeagueId);
  const clear = usePurchaseStore((s) => s.clearCharterCeremony);
  const league = useLeagueStore((s) => (leagueId ? s.leagues.find((l) => l.id === leagueId) ?? (s.currentLeague?.id === leagueId ? s.currentLeague : null) : null));
  const ownerName = useAuthStore((s) => s.user?.displayName ?? 'The owner');
  const signedIn = useAuthStore((s) => !!s.user);
  // The ceremony belongs to the moment of purchase: drop it on sign-out, and if the league has not
  // loaded within a few seconds, rather than let it pop up later on some other screen.
  useEffect(() => {
    if (!leagueId) return;
    if (!signedIn) { clear(); return; }
    if (league) return;
    const t = setTimeout(clear, CEREMONY_WAIT_MS);
    return () => clearTimeout(t);
  }, [leagueId, league, signedIn, clear]);
  const onShare = useCallback(async () => { if (league) await shareCharter(league, ownerName); }, [league, ownerName]);
  if (!leagueId || !league) return null;
  return (
    <Sheet visible onClose={clear}>
      <SheetTitle>{`${league.name} is chartered`}</SheetTitle>
      <Body>You covered every player in it. Pit Wall is included for the season. They ask you before they get in.</Body>
      <View style={{ flexDirection: 'row' }}><CharterButton label="SHARE" onPress={onShare} /></View>
      <Pressable onPress={clear} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 6 }}><MonoLabel>DONE</MonoLabel></Pressable>
    </Sheet>
  );
}

/** The joiner's sheet, first open after approval, once per league. */
export function CharterUnlockSheet({ ownerName, leagueName, onClose }: { ownerName: string; leagueName: string; onClose: () => void }) {
  const { colors } = useSimpleTheme();
  return (
    <Sheet visible onClose={onClose}>
      <SheetTitle>Pit Wall is on</SheetTitle>
      <Body>{`${ownerName} unlocked it for ${leagueName}. Projections, recommendations, and the lineup lab are yours this season.`}</Body>
      <View style={{ flexDirection: 'row' }}><CharterButton label="SEE THE LEAGUE" onPress={onClose} /></View>
      <MonoLabel color={colors.text.muted} style={{ textAlign: 'center' }}>{`YOURS WHILE YOU'RE IN ${leagueName.toUpperCase()}`}</MonoLabel>
    </Sheet>
  );
}

/**
 * The owner's join requests, one person at a time. Approval goes through the server
 * (`charter-approveMember`), which holds the cap and gives a chartered league's new member Pit
 * Wall; Decline deletes the request so the player can ask again.
 */
export function CharterRequestSheet({ leagueId, leagueName, approved, cap, chartered, onClose, onChanged, loadPending = (id) => leagueService.getPendingMembers(id) }: {
  leagueId: string; leagueName: string; approved: number; cap: number; chartered: boolean; onClose: () => void; onChanged: () => void;
  /** Where the requests come from; the league's pending members unless a caller supplies them. */
  loadPending?: (leagueId: string) => Promise<LeagueMember[]>;
}) {
  const { colors, mono } = useSimpleTheme();
  const approveMember = useLeagueStore((s) => s.approveMember);
  const rejectMember = useLeagueStore((s) => s.rejectMember);
  const [queue, setQueue] = useState<LeagueMember[] | null>(null);
  const [count, setCount] = useState(approved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admitted, setAdmitted] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadPending(leagueId).then((p) => { if (live) setQueue(p); }).catch(() => { if (live) setQueue([]); });
    return () => { live = false; };
  }, [leagueId]); // eslint-disable-line react-hooks/exhaustive-deps -- the loader is read once per league

  const current = queue?.[0] ?? null;
  const full = count >= cap;
  const next = useCallback(() => { setAdmitted(null); setError(null); setQueue((q) => (q ? q.slice(1) : q)); }, []);

  const approve = useCallback(async () => {
    if (!current || busy || full) return;
    setBusy(true); setError(null);
    try {
      await approveMember(leagueId, current.userId);
      setCount((c) => c + 1);
      setAdmitted(current.displayName || 'Player');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not approve this player. Try again.');
    } finally { setBusy(false); }
  }, [current, busy, full, approveMember, leagueId, onChanged]);

  const decline = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true); setError(null);
    try {
      await rejectMember(leagueId, current.userId);
      onChanged();
      next();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not decline this request. Try again.');
    } finally { setBusy(false); }
  }, [current, busy, rejectMember, leagueId, onChanged, next]);

  return (
    <Sheet visible onClose={onClose}>
      {queue === null ? (
        <ActivityIndicator color={CHARTER_RED} />
      ) : admitted ? (
        <>
          <SheetTitle>{`${admitted} is in`}</SheetTitle>
          {chartered ? <Body>Pit Wall is on for them because of you.</Body> : null}
          <View style={{ flexDirection: 'row' }}><CharterButton label={queue.length > 1 ? 'NEXT REQUEST' : 'DONE'} onPress={queue.length > 1 ? next : onClose} /></View>
        </>
      ) : current ? (
        <>
          <SheetTitle>{`${current.displayName || 'A player'} wants in`}</SheetTitle>
          <Text style={[mono(11, 'medium'), { color: colors.text.muted }]}>{requestCaption(leagueName, count, cap).toUpperCase()}</Text>
          {full ? <MonoLabel color={CHARTER_RED}>THE LEAGUE IS FULL</MonoLabel> : null}
          {error ? <Text style={[mono(11), { color: CHARTER_RED }]}>{error.toUpperCase()}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <CharterButton label={busy ? '…' : 'APPROVE'} onPress={approve} disabled={busy || full} />
            <CharterButton label="DECLINE" onPress={decline} disabled={busy} muted />
          </View>
        </>
      ) : (
        <>
          <SheetTitle>No requests</SheetTitle>
          <View style={{ flexDirection: 'row' }}><CharterButton label="DONE" onPress={onClose} muted /></View>
        </>
      )}
    </Sheet>
  );
}
