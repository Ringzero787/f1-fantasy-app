// Store — cosmetics-first storefront.
//
// 2026-07-22 redesign (store audit): visual pack cards with helmet preview
// strips, a "My gear" section at the top (owned helmets, tap to equip —
// optimistic, instant), sheet-based purchase flow (PurchaseSheet) instead of
// stacked Alerts, and the Cash/Garage/Pro sections + Restore row hidden until
// real IAP ships (USE_REAL_IAP) — mock-granting cash was an economy hole and
// the tabs read as broken while unbuyable.

import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuthStore } from '@store/auth.store';
import { usePurchasesStore } from '@store/purchases.store';
import { useGarageStore } from '@store/garage.store';
import { StoreItemCard } from '@components/store/StoreItemCard';
import { HelmetPicker } from '@components/tl/HelmetPicker';
import { PurchaseSheet } from '@components/sheets/PurchaseSheet';
import { Cash } from '@components/tl';
import {
  cosmeticPacks,
  consumableProducts,
  garageExpansionProducts,
  subscriptionProducts,
  monetizationConfig,
  PACK_PRICE_GAME_CASH,
} from '@/data/cosmeticsCatalog';
import { purchasesService, USE_REAL_IAP } from '@services/purchases.service';
import { useTheme } from '@/theme';
import { colors, fontSize, spacing } from '@/constants/theme';
import type { CosmeticPack, IAPProductId } from '@/types';

type StoreSection = 'cosmetics' | 'cash' | 'garage' | 'subscription';

export default function StoreScreen() {
  const t = useTheme();
  const userId = useAuthStore((s) => s.user?.id);
  const entitlements = usePurchasesStore((s) => s.entitlements);
  const load = usePurchasesStore((s) => s.load);
  const buy = usePurchasesStore((s) => s.buy);
  const buyPack = usePurchasesStore((s) => s.buyPack);
  const selectCosmetic = usePurchasesStore((s) => s.selectCosmetic);
  const garageCash = useGarageStore((s) => s.garage?.cash ?? 0);
  const refreshGarage = useGarageStore((s) => s.refresh);
  const [section, setSection] = useState<StoreSection>('cosmetics');
  const [buyingPack, setBuyingPack] = useState<CosmeticPack | null>(null);

  useEffect(() => {
    if (userId && !entitlements) load(userId);
  }, [userId, entitlements, load]);

  // Packs cost garage cash — make sure the bankroll shown is current.
  useEffect(() => {
    if (userId) refreshGarage(userId).catch(() => {});
  }, [userId, refreshGarage]);

  const ownedHelmets = entitlements ? purchasesService.ownedHelmets(entitlements) : [];
  const activeHelmetId = entitlements?.activeCosmetics?.helmet_livery;

  const onBuyPack = async (pack: CosmeticPack) => {
    if (!userId) return;
    await buyPack(userId, pack.id);
  };

  const onBuyOther = async (productId: IAPProductId, _label: string) => {
    // Money sections only render when USE_REAL_IAP — real billing flow.
    if (!userId) return;
    await buy(userId, productId);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Store' }} />
      <View style={styles.container}>
        {USE_REAL_IAP && (
          <View style={styles.tabRow}>
            <SectionTab label="Cosmetics" active={section === 'cosmetics'} onPress={() => setSection('cosmetics')} />
            <SectionTab label="Cash" active={section === 'cash'} onPress={() => setSection('cash')} />
            <SectionTab label="Garage" active={section === 'garage'} onPress={() => setSection('garage')} />
            <SectionTab label="Pro" active={section === 'subscription'} onPress={() => setSection('subscription')} />
          </View>
        )}

        <ScrollView contentContainerStyle={styles.list}>
          {section === 'cosmetics' && (
            <View style={{ gap: spacing.md }}>
              {/* Bankroll — packs are bought with garage cash */}
              <View style={{ marginBottom: spacing.sm }}>
                <Text style={styles.sectionLabel}>Bankroll</Text>
                <Cash amount={garageCash} size={28} accent />
              </View>

              {/* My gear — owned helmets, equip in place */}
              <Text style={styles.sectionLabel}>My gear</Text>
              <HelmetPicker
                helmets={ownedHelmets}
                activeId={activeHelmetId}
                onSelect={(id) => {
                  if (userId) selectCosmetic(userId, 'helmet_livery', id);
                }}
              />

              <Text style={[styles.sectionLabel, { marginTop: spacing.lg }]}>Packs</Text>
              <Text style={styles.sectionHelp}>
                Packs add helmets and garage flair, paid from your bankroll. Cosmetic only — no
                effect on scoring.
              </Text>
              {cosmeticPacks
                .filter((p) => !p.isFree)
                .map((p) => (
                  <PackCard
                    key={p.id}
                    pack={p}
                    owned={!!entitlements?.ownedCosmeticPacks.includes(p.id)}
                    cash={garageCash}
                    onPress={() => setBuyingPack(p)}
                  />
                ))}
            </View>
          )}

          {USE_REAL_IAP && section === 'cash' && (
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
                  onPress={() => onBuyOther(c.productId, c.title)}
                />
              ))}
            </View>
          )}

          {USE_REAL_IAP && section === 'garage' && (
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
                    onPress={() => onBuyOther(g.productId, g.title)}
                  />
                );
              })}
            </View>
          )}

          {USE_REAL_IAP && section === 'subscription' && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.sectionHelp}>
                Commissioner Pro unlocks larger leagues (up to {monetizationConfig.COMMISSIONER_PRO_MAX_MEMBERS} members),
                multiple concurrent leagues, exportable ledger, and league branding.
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
                  onPress={() => onBuyOther(s.productId, s.title)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <PurchaseSheet
          pack={buyingPack && !entitlements?.ownedCosmeticPacks.includes(buyingPack.id) ? buyingPack : null}
          cash={garageCash}
          onClose={() => setBuyingPack(null)}
          onBuy={onBuyPack}
        />
      </View>
    </>
  );
}

// Visual pack card: helmet preview strip + name/tagline + garage-cash price or OWNED.
function PackCard({ pack, owned, cash, onPress }: { pack: CosmeticPack; owned: boolean; cash: number; onPress: () => void }) {
  const t = useTheme();
  const helmets = pack.items.filter((i) => i.surface === 'helmet_livery' && i.previewURL);
  const price = PACK_PRICE_GAME_CASH[pack.id] ?? 0;
  const canAfford = cash >= price;
  return (
    <Pressable
      onPress={owned ? undefined : onPress}
      style={({ pressed }) => [
        {
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.line,
          borderRadius: 14,
          padding: 14,
          opacity: pressed && !owned ? 0.9 : 1,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {helmets.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {helmets.slice(0, 2).map((h) => (
              <View
                key={h.id}
                style={{
                  width: 54,
                  height: 54,
                  backgroundColor: t.surface2,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: t.line,
                  padding: 6,
                }}
              >
                <Image source={{ uri: h.previewURL }} style={{ flex: 1, width: '100%' }} resizeMode="contain" />
              </View>
            ))}
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.text, fontFamily: t.fDisp, fontSize: 16, fontWeight: '600', letterSpacing: -0.3 }}>
            {pack.name}
          </Text>
          <Text style={{ color: t.textDim, fontFamily: t.fSans, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {pack.tagline} · {pack.items.length} items
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: owned || !canAfford ? 'transparent' : t.accent,
            borderWidth: owned || !canAfford ? 1 : 0,
            borderColor: t.line,
          }}
        >
          <Text
            style={{
              color: owned || !canAfford ? t.textMute : '#0E1116',
              fontFamily: t.fMono,
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 0.4,
              fontVariant: ['tabular-nums'],
            }}
          >
            {owned ? 'OWNED' : `$${price}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function SectionTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Text onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
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
  sectionLabel: { color: colors.textMuted, fontSize: fontSize.caption, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
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
