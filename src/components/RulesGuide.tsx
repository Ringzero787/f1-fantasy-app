import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface RulesGuideProps {
  visible: boolean;
  onClose: () => void;
}

/* ───────────────── section data ───────────────── */

interface RuleSection {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  content: SectionBlock[];
}

type SectionBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'bullets'; items: string[] };

const SECTIONS: RuleSection[] = [
  {
    id: 'overview',
    icon: 'flag',
    title: 'How It Works',
    content: [
      {
        type: 'paragraph',
        text: 'Build a team of 5 F1 drivers and 1 constructor within a $1,000 budget. Your team earns fantasy points based on real race results throughout the season.',
      },
      { type: 'heading', text: 'Team Composition' },
      {
        type: 'bullets',
        items: [
          '5 drivers + 1 constructor per team',
          '$1,000 starting budget',
          'Drivers sign contracts (default 3 races)',
          'Choose 1 Ace driver for double points',
        ],
      },
    ],
  },
  {
    id: 'scoring',
    icon: 'podium',
    title: 'Race Scoring',
    content: [
      { type: 'heading', text: 'Race Points (Top 10)' },
      {
        type: 'table',
        headers: ['Pos', 'Pts', 'Pos', 'Pts'],
        rows: [
          ['1st', '25', '6th', '8'],
          ['2nd', '18', '7th', '6'],
          ['3rd', '15', '8th', '4'],
          ['4th', '12', '9th', '2'],
          ['5th', '10', '10th', '1'],
        ],
      },
      { type: 'heading', text: 'Sprint Points (Top 8)' },
      {
        type: 'table',
        headers: ['Pos', 'Pts', 'Pos', 'Pts'],
        rows: [
          ['1st', '8', '5th', '4'],
          ['2nd', '7', '6th', '3'],
          ['3rd', '6', '7th', '2'],
          ['4th', '5', '8th', '1'],
        ],
      },
      { type: 'heading', text: 'Bonuses & Penalties' },
      {
        type: 'table',
        headers: ['Event', 'Points'],
        rows: [
          ['Fastest Lap (top 10 only)', '+1'],
          ['Per position gained', '+1'],
          ['Per position lost', '\u22121'],
          ['DNF (Did Not Finish)', '\u22125'],
          ['DSQ (Disqualified)', '\u22125'],
        ],
      },
      {
        type: 'paragraph',
        text: 'Constructor points = average of both drivers\u2019 scores (rounded down).',
      },
    ],
  },
  {
    id: 'ace',
    icon: 'diamond',
    title: 'Ace Driver',
    content: [
      {
        type: 'paragraph',
        text: 'Select one driver as your Ace before each race weekend. Your Ace scores 2\u00D7 points from race and sprint results.',
      },
      { type: 'heading', text: 'Rules' },
      {
        type: 'bullets',
        items: [
          'Only drivers priced $240 or under can be Ace',
          'Ace doubles race + sprint points (not loyalty bonus)',
          'If your Ace\u2019s price rises above $240, they lose Ace status',
          'You can also set your constructor as Ace for 2\u00D7 constructor points',
        ],
      },
    ],
  },
  {
    id: 'loyalty',
    icon: 'heart',
    title: 'Loyalty Bonus',
    content: [
      {
        type: 'paragraph',
        text: 'Hold drivers longer to earn increasing loyalty bonus points each race. The longer you keep a driver, the bigger the reward.',
      },
      {
        type: 'table',
        headers: ['Races Held', 'Bonus / Race'],
        rows: [
          ['1 \u2013 3', '+1 pt'],
          ['4 \u2013 6', '+2 pts'],
          ['7+', '+3 pts'],
          ['Full season (24)', '+100 pts total'],
        ],
      },
      { type: 'heading', text: 'Example' },
      {
        type: 'bullets',
        items: [
          'Hold 3 races: 3 \u00D7 1 = 3 bonus pts',
          'Hold 5 races: (3 \u00D7 1) + (2 \u00D7 2) = 7 bonus pts',
          'Hold 10 races: (3 \u00D7 1) + (3 \u00D7 2) + (4 \u00D7 3) = 21 bonus pts',
        ],
      },
    ],
  },
  {
    id: 'contracts',
    icon: 'document-text',
    title: 'Contracts & Transfers',
    content: [
      {
        type: 'paragraph',
        text: 'When you sign a driver, they\u2019re on a contract (default 3 races). You can customize the length when adding them.',
      },
      { type: 'heading', text: 'Contract Expiry' },
      {
        type: 'bullets',
        items: [
          'When a driver\u2019s contract ends, they\u2019re auto-sold at market price',
          'The driver is locked out for 1 race (can\u2019t re-sign immediately)',
          'Your earned points are banked safely',
          'Budget from the sale is returned to you',
        ],
      },
      { type: 'heading', text: 'Selling Early' },
      {
        type: 'bullets',
        items: [
          'You can sell before a contract expires',
          'Early termination fee: 3% of price \u00D7 races remaining',
          'Example: $200 driver with 2 races left = $12 fee',
        ],
      },
    ],
  },
  {
    id: 'autofill',
    icon: 'flash',
    title: 'Auto-Fill',
    content: [
      {
        type: 'paragraph',
        text: 'If your team drops below 5 drivers (e.g. after contracts expire), the system automatically fills empty slots so you never miss scoring.',
      },
      { type: 'heading', text: 'How It Works' },
      {
        type: 'bullets',
        items: [
          'Triggers when contracts expire and leave empty slots',
          'Picks the cheapest available drivers you can afford',
          'Auto-filled drivers are marked as reserve picks',
          'Same applies if you\u2019re missing a constructor',
          'Won\u2019t fill if you have active lockouts pending',
        ],
      },
    ],
  },
  {
    id: 'lockout',
    icon: 'lock-closed',
    title: 'Lockout',
    content: [
      { type: 'heading', text: 'Team Lockout' },
      {
        type: 'paragraph',
        text: 'Your team locks before each race weekend so you can\u2019t make changes during the event.',
      },
      {
        type: 'bullets',
        items: [
          'Normal weekend: locks at FP3 start',
          'Sprint weekend: locks at Sprint Qualifying start',
          'Teams unlock after the race is marked complete',
        ],
      },
      { type: 'heading', text: 'Driver Lockout' },
      {
        type: 'paragraph',
        text: 'When a driver\u2019s contract expires, they can\u2019t be re-signed for 1 race. This prevents exploiting short contracts for free loyalty resets.',
      },
    ],
  },
  {
    id: 'prices',
    icon: 'trending-up',
    title: 'Price Changes',
    content: [
      {
        type: 'paragraph',
        text: 'Driver prices update after each race based on performance. Prices are grouped by tier \u2014 expensive drivers have bigger price swings.',
      },
      { type: 'heading', text: 'Price Tiers' },
      {
        type: 'table',
        headers: ['Tier', 'Price Range'],
        rows: [
          ['A-Tier', 'Over $240'],
          ['B-Tier', '$121 \u2013 $240'],
          ['C-Tier', '$120 or under'],
        ],
      },
      { type: 'heading', text: 'Price Adjustments' },
      {
        type: 'table',
        headers: ['Rating', 'A', 'B', 'C'],
        rows: [
          ['Great', '+$36', '+$24', '+$12'],
          ['Good', '+$12', '+$7', '+$5'],
          ['Poor', '\u2212$12', '\u2212$7', '\u2212$5'],
          ['Terrible', '\u2212$36', '\u2212$24', '\u2212$12'],
        ],
      },
      {
        type: 'bullets',
        items: [
          'Min price: $5 \u2014 Max price: $700',
          'Price increases are dampened above $400',
          'DNF causes an additional price penalty (up to \u2212$24 for lap 1 DNF)',
        ],
      },
    ],
  },
  {
    id: 'leagues',
    icon: 'trophy',
    title: 'Leagues',
    content: [
      {
        type: 'paragraph',
        text: 'Create or join leagues to compete against friends. Share an invite code and track standings on the leaderboard all season.',
      },
      { type: 'heading', text: 'Features' },
      {
        type: 'bullets',
        items: [
          'Up to 22 members per league',
          'League owner can post announcements',
          'Co-admins can help manage the league',
          'Invite friends via a shareable code',
          'Leaderboard tracks total points across all races',
        ],
      },
    ],
  },
  {
    id: 'bonuses',
    icon: 'star',
    title: 'Special Bonuses',
    content: [
      { type: 'heading', text: 'Hot Hand Bonus' },
      {
        type: 'paragraph',
        text: 'Newly signed drivers earn bonus points in their first race with you.',
      },
      {
        type: 'bullets',
        items: [
          'Podium finish (P1\u2013P3): +15 pts',
          '15+ points scored: +10 pts',
        ],
      },
      { type: 'heading', text: 'Value Capture Bonus' },
      {
        type: 'paragraph',
        text: 'Earn points when you sell a driver for profit.',
      },
      {
        type: 'bullets',
        items: [
          '+5 pts per $10 of profit',
          'Example: Sell for $30 profit = +15 pts',
        ],
      },
      { type: 'heading', text: 'Stale Roster Penalty' },
      {
        type: 'paragraph',
        text: 'Make transfers regularly to avoid a points penalty.',
      },
      {
        type: 'bullets',
        items: [
          'No transfer for 5+ races: \u22125 pts per additional race',
          'Resets when you make any transfer',
        ],
      },
    ],
  },
];

/* ───────────────── component ───────────────── */

export function RulesGuide({ visible, onClose }: RulesGuideProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeSection, setActiveSection] = useState(0);
  const sectionOffsets = useRef<number[]>([]);

  const handleChipPress = (index: number) => {
    setActiveSection(index);
    const y = sectionOffsets.current[index];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: y - 60, animated: true });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Rules & Scoring</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={COLORS.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Section chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipBar}
          contentContainerStyle={styles.chipBarContent}
        >
          {SECTIONS.map((s, i) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, i === activeSection && styles.chipActive]}
              onPress={() => handleChipPress(i)}
            >
              <Ionicons
                name={s.icon}
                size={14}
                color={i === activeSection ? COLORS.text.inverse : COLORS.text.secondary}
              />
              <Text
                style={[styles.chipText, i === activeSection && styles.chipTextActive]}
              >
                {s.title}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y + 80;
            let idx = 0;
            for (let i = sectionOffsets.current.length - 1; i >= 0; i--) {
              if (sectionOffsets.current[i] <= y) {
                idx = i;
                break;
              }
            }
            if (idx !== activeSection) setActiveSection(idx);
          }}
          scrollEventThrottle={64}
        >
          {SECTIONS.map((section, sIdx) => (
            <View
              key={section.id}
              onLayout={(e) => {
                sectionOffsets.current[sIdx] = e.nativeEvent.layout.y;
              }}
              style={styles.section}
            >
              {/* Section header */}
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconCircle}>
                  <Ionicons name={section.icon} size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>

              {/* Section blocks */}
              {section.content.map((block, bIdx) => {
                switch (block.type) {
                  case 'paragraph':
                    return (
                      <Text key={bIdx} style={styles.paragraph}>
                        {block.text}
                      </Text>
                    );
                  case 'heading':
                    return (
                      <Text key={bIdx} style={styles.subheading}>
                        {block.text}
                      </Text>
                    );
                  case 'bullets':
                    return (
                      <View key={bIdx} style={styles.bulletList}>
                        {block.items.map((item, iIdx) => (
                          <View key={iIdx} style={styles.bulletRow}>
                            <Text style={styles.bulletDot}>{'\u2022'}</Text>
                            <Text style={styles.bulletText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  case 'table':
                    return (
                      <View key={bIdx} style={styles.table}>
                        {/* Header row */}
                        <View style={[styles.tableRow, styles.tableHeaderRow]}>
                          {block.headers.map((h, hIdx) => (
                            <Text
                              key={hIdx}
                              style={[
                                styles.tableCell,
                                styles.tableHeaderCell,
                                { flex: 1 },
                              ]}
                            >
                              {h}
                            </Text>
                          ))}
                        </View>
                        {/* Data rows */}
                        {block.rows.map((row, rIdx) => (
                          <View
                            key={rIdx}
                            style={[
                              styles.tableRow,
                              rIdx % 2 === 1 && styles.tableRowAlt,
                            ]}
                          >
                            {row.map((cell, cIdx) => (
                              <Text
                                key={cIdx}
                                style={[styles.tableCell, { flex: 1 }]}
                              >
                                {cell}
                              </Text>
                            ))}
                          </View>
                        ))}
                      </View>
                    );
                  default:
                    return null;
                }
              })}
            </View>
          ))}

          <View style={{ height: 60 }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ───────────────── styles ───────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingBottom: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: '700',
    color: COLORS.text.primary,
  },
  closeButton: {
    padding: SPACING.xs,
  },

  /* chip bar */
  chipBar: {
    maxHeight: 48,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.default,
  },
  chipBarContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
  },
  chipTextActive: {
    color: COLORS.text.inverse,
  },

  /* body */
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: SPACING.lg,
  },

  /* sections */
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '700',
    color: COLORS.text.primary,
  },

  /* text blocks */
  paragraph: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  subheading: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  /* bullets */
  bulletList: {
    marginBottom: SPACING.md,
    gap: SPACING.xs + 2,
  },
  bulletRow: {
    flexDirection: 'row',
    paddingLeft: SPACING.xs,
  },
  bulletDot: {
    fontSize: FONTS.sizes.md,
    color: COLORS.primary,
    width: 16,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    lineHeight: 22,
  },

  /* tables */
  table: {
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableRowAlt: {
    backgroundColor: COLORS.surface,
  },
  tableHeaderRow: {
    backgroundColor: COLORS.card,
  },
  tableCell: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
  },
  tableHeaderCell: {
    fontWeight: '700',
    color: COLORS.text.primary,
    fontSize: FONTS.sizes.sm,
  },
});
