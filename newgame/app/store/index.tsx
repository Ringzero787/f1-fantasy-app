import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { usePurchasesStore } from '@store/purchases.store';
import { useGarageStore } from '@store/garage.store';
import { StoreItemCard } from '@components/store/StoreItemCard';
import {
  cosmeticPacks,
  consumableProducts,
  garageExpansionProducts,
  subscriptionProducts,
  monetizationConfig,
} from '@/data/cosmeticsCatalog';
import { USE_REAL_IAP } from '@services/purchases.service';
import { colors, fontSize, spacing } from '@/constants/theme';
import type { IAPProductId } from '@/types';

type StoreSection = 'cosmetics' | 'cash' | 'garage' | 'subscription';

export default function StoreScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const entitlements = usePurchasesStore((s) => s.entitlements);
  const load = usePurchasesStore((s) => s.load);
  const buy = usePurchasesStore((s) => s.buy);
  const restore = usePurchasesStore((s) => s.restore);
  const refreshGarage = useGarageStore((s) => s.refresh);
  const [section, setSection] = useState<StoreSection>('cosmetics');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (userId && !entitlements) load(userId);
  }, [userId, entitlements, load]);

  const onBuy = async (productId: IAPProductId, label: string) => {
    if (!userId) return;
    const message = USE_REAL_IAP
      ? `Charged via App Store. Entitlement applies after server validates the receipt.`
      : `Mock purchase — entitlement applies locally. Real IAP unlocks after SKUs are registered.`;
    Alert.alert(`Buy ${label}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: USE_REAL_IAP ? 'Buy' : 'Buy (mock)',
        onPress: async () => {
          try {
            await buy(userId, productId);
            await refreshGarage(userId);
            Alert.alert('Purchase recorded', 'Entitlement applied.');
          } catch (err) {
            Alert.alert('Purchase failed', err instanceof Error ? err.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  const onRestore = async () => {
    setRestoring(true);
    try {
      const r = await restore();
      if (r.viaMock) {
        Alert.alert(
          'Restore (mock)',
          'Real IAP not active in this build. When live, this re-validates every store purchase against the server.'
        );
      } else if (r.count === 0) {
        Alert.alert('No purchases to restore', 'Nothing to bring back.');
      } else {
        Alert.alert('Restored', `${r.count} purchase(s) re-applied.${r.errors.length ? `\n${r.errors.length} errors.` : ''}`);
      }
      if (userId) await refreshGarage(userId);
    } catch (err) {
      Alert.alert('Restore failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Store' }} />
      <View style={styles.container}>
        <View style={styles.tabRow}>
          <SectionTab label="Cosmetics" active={section === 'cosmetics'} onPress={() => setSection('cosmetics')} />
          <SectionTab label="Cash" active={section === 'cash'} onPress={() => setSection('cash')} />
          <SectionTab label="Garage" active={section === 'garage'} onPress={() => setSection('garage')} />
          <SectionTab label="Pro" active={section === 'subscription'} onPress={() => setSection('subscription')} />
        </View>

        <Pressable onPress={onRestore} disabled={restoring} style={styles.restoreRow}>
          <Text style={styles.restoreText}>{restoring ? 'Restoring...' : 'Restore purchases'}</Text>
        </Pressable>

        <ScrollView contentContainerStyle={styles.list}>
          {section === 'cosmetics' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.sectionHelp}>Cosmetic packs personalize helmets, garage skin, app icon, and more. No effect on scoring.</Text>
              {cosmeticPacks
                .filter((p) => !p.isFree)
                .map((p) => {
                  const owned = entitlements?.ownedCosmeticPacks.includes(p.id);
                  return (
                    <StoreItemCard
                      key={p.id}
                      title={p.name}
                      description={`${p.tagline} · ${p.items.length} items`}
                      priceUsdCents={p.priceUsdCents}
                      badge={p.category === 'premium' ? 'PREMIUM' : p.category === 'era' ? 'ERA' : undefined}
                      ownedLabel={owned ? 'OWNED' : undefined}
                      disabled={!!owned}
                      onPress={() => onBuy(p.productId, p.name)}
                    />
                  );
                })}
            </View>
          )}

          {section === 'cash' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.sectionHelp}>
                Buy in-game cash to spend on rerolls and driver purchases. Capped at {monetizationConfig.WEEKLY_CASH_BUNDLE_CAP} per race weekend.
              </Text>
              {consumableProducts.map((c) => (
                <StoreItemCard
                  key={c.productId}
                  title={c.title}
                  description={c.description}
                  priceUsdCents={c.priceUsdCents}
                  badge={c.bestValueBadge ? 'BEST VALUE' : undefined}
                  onPress={() => onBuy(c.productId, c.title)}
                />
              ))}
            </View>
          )}

          {section === 'garage' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.sectionHelp}>
                Expand your garage to hold one extra driver and one extra constructor. Permanent upgrade.
              </Text>
              {garageExpansionProducts.map((g) => {
                const isDriverSlot = g.productId === 'tl.garage.driver_slot';
                const owned = isDriverSlot
                  ? (entitlements?.extraDriverSlots ?? 0) >= g.capPerUser
                  : (entitlements?.extraConstructorSlots ?? 0) >= g.capPerUser;
                return (
                  <StoreItemCard
                    key={g.productId}
                    title={g.title}
                    description={g.description}
                    priceUsdCents={g.priceUsdCents}
                    ownedLabel={owned ? 'OWNED' : undefined}
                    disabled={owned}
                    onPress={() => onBuy(g.productId, g.title)}
                  />
                );
              })}
            </View>
          )}

          {section === 'subscription' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.sectionHelp}>
                Commissioner Pro unlocks larger leagues (up to {monetizationConfig.COMMISSIONER_PRO_MAX_MEMBERS} members),
                multiple concurrent leagues, exportable ledger, and league branding.
                {monetizationConfig.COMMISSIONER_PRO_FREE_TRIAL_DAYS > 0
                  ? ` ${monetizationConfig.COMMISSIONER_PRO_FREE_TRIAL_DAYS}-day free trial.`
                  : ''}
              </Text>
              {entitlements?.commissionerProActive && (
                <View style={styles.activeBox}>
                  <Text style={styles.activeText}>
                    Commissioner Pro is active ({entitlements.commissionerProTier}).
                  </Text>
                </View>
              )}
              {subscriptionProducts.map((s) => (
                <StoreItemCard
                  key={s.productId}
                  title={s.title}
                  description={s.description}
                  priceUsdCents={s.priceUsdCents}
                  badge={s.bestValueBadge ? 'BEST VALUE' : undefined}
                  onPress={() => onBuy(s.productId, s.title)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

function SectionTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  tab: { color: colors.textMuted, fontSize: fontSize.body, fontWeight: '700', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  tabActive: { color: colors.accent, borderBottomColor: colors.accent, borderBottomWidth: 2 },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  restoreRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  restoreText: { color: colors.accent, fontSize: fontSize.caption, fontWeight: '700' },
  sectionHelp: { color: colors.textMuted, fontSize: fontSize.caption, lineHeight: 18, marginBottom: spacing.sm },
  activeBox: {
    backgroundColor: colors.success + '22',
    borderColor: colors.success,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
  },
  activeText: { color: colors.success, fontSize: fontSize.body, fontWeight: '700' },
});
