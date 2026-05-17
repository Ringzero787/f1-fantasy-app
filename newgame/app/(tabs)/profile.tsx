import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { useGarageStore } from '@store/garage.store';
import { useShopStore } from '@store/shop.store';
import { usePurchasesStore } from '@store/purchases.store';
import { useGarageWithEntities } from '@/hooks/useGarageWithEntities';
import { authService } from '@services/auth.service';
import { purchasesService } from '@services/purchases.service';
import { invalidateHelmetCache } from '@components/HelmetAvatar';
import { avatarsService } from '@services/avatars.service';
import { getHelmetUrl } from '@/data/cosmeticsCatalog';
import { useTheme, useThemePrefs, TL_PALETTES } from '@/theme';
import type { Palette, ThemeMode } from '@/theme';
import { Num, PrimaryBtn, SectionLabel } from '@components/tl';

export default function ProfileScreen() {
  const t = useTheme();
  const { mode, palette, setMode, setPalette } = useThemePrefs();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);
  const resetGarage = useGarageStore((s) => s.reset);
  const resetShop = useShopStore((s) => s.reset);
  const entitlements = usePurchasesStore((s) => s.entitlements);
  const loadEntitlements = usePurchasesStore((s) => s.load);
  const refreshEntitlements = usePurchasesStore((s) => s.refresh);
  const { garage } = useGarageWithEntities();
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (user && !entitlements) loadEntitlements(user.id);
  }, [user, entitlements, loadEntitlements]);

  const ownedHelmets = entitlements ? purchasesService.ownedHelmets(entitlements) : [];
  const activeHelmetId = entitlements?.activeCosmetics?.helmet_livery;
  const activeHelmetUrl = getHelmetUrl(activeHelmetId);
  const [uploading, setUploading] = useState(false);

  // Resolved avatar to render in the top-left circle. Custom photo wins, then
  // helmet livery, then a fallback initial.
  const resolvedAvatarUrl = user?.photoURL || activeHelmetUrl;

  const onUploadPhoto = async () => {
    if (!user || uploading) return;
    setUploading(true);
    try {
      const url = await avatarsService.pickAndUploadUserAvatar(user.id);
      if (url) {
        setUser({ ...user, photoURL: url });
        invalidateHelmetCache(user.id);
      }
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setUploading(false);
    }
  };

  const onSelectHelmet = async (itemId: string) => {
    if (!user) return;
    try {
      await purchasesService.selectCosmetic({ userId: user.id, surface: 'helmet_livery', cosmeticItemId: itemId });
      invalidateHelmetCache(user.id);
      await refreshEntitlements(user.id);
      setPickerOpen(false);
    } catch (err) {
      Alert.alert('Could not switch helmet', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          resetGarage();
          resetShop();
        },
      },
    ]);
  };

  const onDeleteAccount = () => {
    if (!user) return;
    Alert.alert(
      'Delete account?',
      'Your garage, lineups, and league memberships will be permanently removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await authService.deleteAccount(user.id);
              resetGarage();
              resetShop();
            } catch (err) {
              Alert.alert('Could not delete', err instanceof Error ? err.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  if (!user) return null;

  return (
    <ScrollView contentContainerStyle={[styles.root, { backgroundColor: t.bg }]}>
      {/* Avatar + name header */}
      <View style={[styles.header, { borderBottomColor: t.lineSoft }]}>
        <Pressable
          onPress={() => setPickerOpen((v) => !v)}
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: t.surface2,
            borderWidth: 2,
            borderColor: t.tierAEdge,
            shadowColor: t.tierA,
            shadowOpacity: 0.3,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 0 },
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {resolvedAvatarUrl ? (
            <Image source={{ uri: resolvedAvatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : (
            <Text style={{ color: t.text, fontFamily: t.fDisp, fontWeight: '700', fontSize: 32 }}>
              {user.displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>
            {user.displayName}
          </Text>
          <Text style={{ color: t.textDim, fontFamily: t.fSans, fontSize: 13, marginTop: 2 }}>{user.email}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 }}>
            <Pressable onPress={onUploadPhoto} disabled={uploading}>
              <Text
                style={{
                  color: t.accent,
                  fontFamily: t.fMono,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {uploading ? 'Uploading…' : 'Upload photo'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setPickerOpen((v) => !v)}>
              <Text
                style={{
                  color: t.accent,
                  fontFamily: t.fMono,
                  fontSize: 10,
                  fontWeight: '700',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {pickerOpen ? 'Done' : 'Change helmet'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Helmet picker */}
      {pickerOpen && (
        <View style={[styles.helmetGrid, { backgroundColor: t.surface, borderColor: t.line }]}>
          {ownedHelmets.length === 0 ? (
            <Text style={{ color: t.textMute, fontFamily: t.fSans, fontSize: 13, padding: 16, textAlign: 'center' }}>
              You don't own any helmets yet.
            </Text>
          ) : (
            ownedHelmets.map((h) => {
              const active = activeHelmetId === h.id;
              return (
                <Pressable
                  key={h.id}
                  onPress={() => onSelectHelmet(h.id)}
                  style={{
                    flexBasis: '30%',
                    flexGrow: 1,
                    aspectRatio: 1,
                    backgroundColor: t.surface2,
                    borderRadius: 10,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? t.accent : t.line,
                    padding: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Image source={{ uri: h.url }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
                  <Text
                    style={{
                      color: t.text,
                      fontFamily: t.fMono,
                      fontSize: 9,
                      fontWeight: '600',
                      letterSpacing: 0.4,
                      textAlign: 'center',
                    }}
                    numberOfLines={1}
                  >
                    {h.name}
                  </Text>
                  {active ? (
                    <Text
                      style={{
                        color: t.accent,
                        fontFamily: t.fMono,
                        fontSize: 8,
                        fontWeight: '800',
                        letterSpacing: 1,
                      }}
                    >
                      ACTIVE
                    </Text>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </View>
      )}

      {/* 3-column stat grid */}
      {garage && (
        <View style={styles.statsGrid}>
          <Stat label="Cash" value={`$${garage.cash}`} />
          <Stat label="Season pts" value={`${garage.totalPoints}`} />
          <Stat label="Earned" value={`$${garage.totalCashEarned}`} />
        </View>
      )}

      {/* Theme + palette */}
      <SectionLabel>Theme</SectionLabel>
      <View style={[styles.row, { gap: 6 }]}>
        {(['auto', 'light', 'dark'] as const).map((m) => (
          <ChipBtn key={m} active={mode === m} onPress={() => setMode(m as ThemeMode)} label={m.toUpperCase()} />
        ))}
      </View>

      <SectionLabel>Accent</SectionLabel>
      <View style={[styles.row, { gap: 8 }]}>
        {(Object.keys(TL_PALETTES) as Palette[]).map((p) => (
          <Pressable
            key={p}
            onPress={() => setPalette(p)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: TL_PALETTES[p],
              borderWidth: palette === p ? 3 : 0,
              borderColor: t.text,
            }}
          />
        ))}
      </View>

      {/* Account actions */}
      <SectionLabel>Account</SectionLabel>
      <View style={[styles.actionsBlock, { backgroundColor: t.surface, borderColor: t.line }]}>
        <ActionRow label="Standings" onPress={() => router.push('/standings')} />
        <ActionRow label="Store" onPress={() => router.push('/store')} />
        <ActionRow label="Demo & debug" onPress={() => router.push('/demo')} />
        <ActionRow label="Sign out" onPress={onSignOut} />
        <ActionRow label="Delete account" destructive onPress={onDeleteAccount} />
      </View>

      <Text style={{ color: t.textMute, fontFamily: t.fMono, fontSize: 10, textAlign: 'center', marginTop: 24, letterSpacing: 1 }}>
        TRACK LIMITS · v0.1.0
      </Text>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: t.line, gap: 6 }}>
      <Text
        style={{
          color: t.textMute,
          fontFamily: t.fMono,
          fontSize: 9,
          fontWeight: '700',
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
      <Num size={20} weight="700">
        {value}
      </Num>
    </View>
  );
}

function ChipBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        height: 32,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: active ? t.accent : 'transparent',
        borderWidth: 1,
        borderColor: active ? t.accent : t.line,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: active ? '#0E1116' : t.text,
          fontFamily: t.fMono,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActionRow({ label, destructive, onPress }: { label: string; destructive?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 14,
          paddingHorizontal: 18,
          borderBottomWidth: 1,
          borderBottomColor: t.lineSoft,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        style={{
          color: destructive ? t.danger : t.text,
          fontFamily: t.fSans,
          fontSize: 15,
          fontWeight: '500',
        }}
      >
        {label}
      </Text>
      <Text style={{ color: t.textMute, fontSize: 16 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { padding: 18, paddingBottom: 40, gap: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingBottom: 18,
    borderBottomWidth: 1,
  },
  helmetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  statsGrid: { flexDirection: 'row', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', paddingHorizontal: 20 },
  actionsBlock: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
});
