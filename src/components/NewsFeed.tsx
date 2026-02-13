import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useNewsStore } from '../store/news.store';
import type { Article, ArticleCategory } from '../types';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - SPACING.md * 2 - SPACING.sm;
const CARD_GAP = SPACING.sm;

const SOURCE_COLORS: Record<string, string> = {
  F1: '#E10600',
  FIA: '#003399',
};

const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  practice: 'Practice',
  qualifying: 'Qualifying',
  race: 'Race',
  transfer: 'Transfer',
  regulation: 'Regulation',
  general: 'General',
};

function getTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

const MAX_ARTICLES = 5;

export function NewsFeed() {
  const allArticles = useNewsStore(s => s.articles);
  const isLoading = useNewsStore(s => s.isLoading);
  const readArticleIds = useNewsStore(s => s.readArticleIds);
  const toggleArticleRead = useNewsStore(s => s.toggleArticleRead);
  const scrollViewRef = useRef<ScrollView>(null);
  // Sort unread first, then take top MAX_ARTICLES
  const articles = [...allArticles]
    .sort((a, b) => {
      const aRead = readArticleIds.includes(a.id) ? 1 : 0;
      const bRead = readArticleIds.includes(b.id) ? 1 : 0;
      return aRead - bRead;
    })
    .slice(0, MAX_ARTICLES);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_GAP));
    setActiveIndex(index);
  }, []);

  const handleMarkRead = useCallback((id: string) => {
    const wasRead = readArticleIds.includes(id);
    toggleArticleRead(id);
    // If marking as read, scroll back to first card
    if (!wasRead) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: 0, animated: true });
        setActiveIndex(0);
      }, 300);
    }
  }, [readArticleIds, toggleArticleRead]);

  const handleReadMore = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      // silently fail
    }
  }, []);

  if (articles.length === 0 && !isLoading) return null;

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="newspaper-outline" size={18} color={COLORS.primary} />
          <Text style={styles.headerTitle}>F1 News</Text>
          {articles.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeIndex + 1} / {articles.length}</Text>
            </View>
          )}
        </View>
      </View>

      {isLoading && articles.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_WIDTH + CARD_GAP}
            decelerationRate="fast"
            contentContainerStyle={styles.scrollContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
          >
            {articles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                isRead={readArticleIds.includes(article.id)}
                onReadMore={handleReadMore}
                onToggleRead={() => handleMarkRead(article.id)}
              />
            ))}
          </ScrollView>

          {/* Dot Indicators */}
          {articles.length > 1 && (
            <View style={styles.dotsContainer}>
              {articles.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === activeIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function ArticleCard({
  article,
  isRead,
  onReadMore,
  onToggleRead,
}: {
  article: Article;
  isRead: boolean;
  onReadMore: (url: string) => void;
  onToggleRead: () => void;
}) {
  const sourceColor = SOURCE_COLORS[article.source] || COLORS.primary;

  return (
    <View style={[styles.card, isRead && styles.cardRead]}>
      {/* Top row: source badge + read badge + time */}
      <View style={styles.cardTopRow}>
        <View style={styles.cardTopLeft}>
          <View style={[styles.sourceBadge, { backgroundColor: sourceColor }]}>
            <Text style={styles.sourceBadgeText}>{article.source}</Text>
          </View>
          {isRead && (
            <View style={styles.readBadge}>
              <Ionicons name="checkmark" size={10} color={COLORS.text.muted} />
              <Text style={styles.readBadgeText}>Read</Text>
            </View>
          )}
        </View>
        <Text style={styles.timeAgo}>{getTimeAgo(article.publishedAt)}</Text>
      </View>

      {/* Title */}
      <Text style={[styles.cardTitle, isRead && styles.cardTitleRead]} numberOfLines={2}>
        {article.title}
      </Text>

      {/* Summary */}
      <Text style={[styles.cardSummary, isRead && styles.cardSummaryRead]} numberOfLines={3}>
        {article.summary}
      </Text>

      {/* Bottom row: category chip + mark read + read more */}
      <View style={styles.cardBottomRow}>
        <View style={styles.categoryChip}>
          <Text style={styles.categoryChipText}>
            {CATEGORY_LABELS[article.category] || article.category}
          </Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.markReadButton, isRead && styles.markReadButtonActive]}
            onPress={onToggleRead}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isRead ? 'eye' : 'eye-off-outline'}
              size={16}
              color={isRead ? COLORS.primary : COLORS.text.secondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.readMoreButton}
            onPress={() => onReadMore(article.sourceUrl)}
          >
            <Text style={styles.readMoreText}>Read More</Text>
            <Ionicons name="open-outline" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.lg,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  countBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BORDER_RADIUS.full,
    marginLeft: 2,
  },

  countBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },

  loadingContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },

  scrollContent: {
    paddingRight: SPACING.md,
    gap: CARD_GAP,
  },

  card: {
    width: CARD_WIDTH,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  cardRead: {
    opacity: 0.65,
  },

  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },

  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  readBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COLORS.text.muted + '20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  readBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  sourceBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },

  timeAgo: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },

  cardTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    lineHeight: 20,
    marginBottom: SPACING.xs,
  },

  cardTitleRead: {
    color: COLORS.text.muted,
  },

  cardSummary: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
    flex: 1,
  },

  cardSummaryRead: {
    color: COLORS.text.muted,
  },

  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },

  markReadButton: {
    padding: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.text.secondary,
  },
  markReadButtonActive: {
    backgroundColor: COLORS.primary + '25',
    borderWidth: 1,
    borderColor: COLORS.primary + '50',
  },

  categoryChip: {
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },

  categoryChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primary,
  },

  readMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  readMoreText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
  },

  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.border.default,
  },

  dotActive: {
    backgroundColor: COLORS.primary,
    width: 18,
    borderRadius: 4,
  },
});
