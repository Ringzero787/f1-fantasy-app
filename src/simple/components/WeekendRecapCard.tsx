import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { S_FONTS, S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
import { useWeekendRecap } from '../hooks/useWeekendRecap';

/**
 * One-time post-weekend recap shown on sign-in after a race the user's team
 * was scored for. Self-gating via useWeekendRecap — renders null when there's
 * nothing new to show, so it's safe to mount unconditionally.
 */
export function WeekendRecapCard() {
  const { colors, fonts, spacing } = useSimpleTheme();
  const { recap, dismiss } = useWeekendRecap();

  if (!recap) return null;

  const { raceName, teamPoints, best, worst, rank, leagueSize, entities } = recap;
  const positive = teamPoints >= 0;
  const showWorst = worst && best && worst.name !== best.name && worst.points < best.points;

  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Ionicons name="flag" size={28} color={colors.primary} style={{ marginBottom: spacing.xs }} />
          <Text style={[styles.kicker, { color: colors.text.muted }]}>WEEKEND RECAP</Text>
          <Text style={[styles.title, { color: colors.text.primary, fontSize: fonts.xl }]}>{raceName}</Text>

          {/* Headline points */}
          <Text style={[styles.points, { color: positive ? colors.positive : colors.negative }]}>
            {sign(teamPoints)} pts
          </Text>
          {rank != null && (
            <Text style={[styles.rank, { color: colors.text.secondary, fontSize: fonts.md }]}>
              League rank: {rank}{leagueSize ? ` / ${leagueSize}` : ''}
            </Text>
          )}

          {/* Best / worst */}
          <View style={styles.highlightRow}>
            {best && (
              <View style={styles.highlight}>
                <Ionicons name="trophy" size={16} color={colors.primary} />
                <Text style={[styles.hlName, { color: colors.text.primary }]} numberOfLines={1}>{best.name}</Text>
                <Text style={[styles.hlPts, { color: colors.positive }]}>{sign(best.points)}</Text>
                <Text style={[styles.hlLabel, { color: colors.text.muted }]}>Top scorer</Text>
              </View>
            )}
            {showWorst && (
              <View style={styles.highlight}>
                <Ionicons name="trending-down" size={16} color={colors.negative} />
                <Text style={[styles.hlName, { color: colors.text.primary }]} numberOfLines={1}>{worst!.name}</Text>
                <Text style={[styles.hlPts, { color: worst!.points >= 0 ? colors.text.secondary : colors.negative }]}>{sign(worst!.points)}</Text>
                <Text style={[styles.hlLabel, { color: colors.text.muted }]}>Lowest</Text>
              </View>
            )}
          </View>

          {/* Per-entity breakdown */}
          <View style={[styles.breakdown, { borderTopColor: colors.border }]}>
            {entities.map((e) => (
              <View key={e.name + (e.isConstructor ? '_c' : '')} style={styles.row}>
                <Text style={[styles.rowName, { color: colors.text.secondary }]} numberOfLines={1}>
                  {e.isConstructor ? '🏎  ' : ''}{e.name}
                </Text>
                <Text style={[styles.rowPts, { color: e.points > 0 ? colors.positive : e.points < 0 ? colors.negative : colors.text.muted }]}>
                  {sign(e.points)}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: S_RADIUS.lg, padding: 24, alignItems: 'center' },
  kicker: { fontSize: 11, letterSpacing: 1.5, fontFamily: S_FONT_FAMILY.body.bold },
  title: { fontFamily: S_FONT_FAMILY.body.bold, marginTop: 2, textAlign: 'center' },
  points: { fontSize: 40, fontFamily: S_FONT_FAMILY.body.bold, marginTop: 8 },
  rank: { marginTop: 2 },
  highlightRow: { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%', justifyContent: 'center' },
  highlight: { flex: 1, alignItems: 'center', maxWidth: 150 },
  hlName: { fontSize: 14, fontFamily: S_FONT_FAMILY.body.semibold, marginTop: 4 },
  hlPts: { fontSize: 16, fontFamily: S_FONT_FAMILY.body.bold },
  hlLabel: { fontSize: 11, marginTop: 2 },
  breakdown: { width: '100%', borderTopWidth: 1, marginTop: 18, paddingTop: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowName: { fontSize: 13, flex: 1 },
  rowPts: { fontSize: 13, fontFamily: S_FONT_FAMILY.body.semibold, marginLeft: 8 },
  btn: { marginTop: 22, paddingVertical: 13, borderRadius: S_RADIUS.lg, width: '100%', alignItems: 'center' },
  btnText: { color: '#FFFFFF', fontFamily: S_FONT_FAMILY.body.bold, fontSize: 15 },
});
