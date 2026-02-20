import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Card, EmptyState } from '../components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { useTheme } from '../hooks/useTheme';
import { articleService } from '../services/article.service';
import type { Article, ArticleStatus } from '../types';

type TabFilter = 'draft' | 'approved' | 'rejected';

function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const SOURCE_COLORS: Record<string, string> = {
  F1: '#E10600',
  FIA: '#003399',
};

const STATUS_COLORS: Record<ArticleStatus, string> = {
  draft: COLORS.warning,
  approved: COLORS.success,
  rejected: COLORS.error,
};

export default function NewsManageContent() {
  const theme = useTheme();
  const [tab, setTab] = useState<TabFilter>('draft');
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftCount, setDraftCount] = useState(0);
  const [editedSummaries, setEditedSummaries] = useState<Record<string, string>>({});
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const loadArticles = useCallback(async () => {
    setLoading(true);
    const fetched = await articleService.fetchArticlesByStatus(tab);
    // Sort unread first, read articles at the bottom
    fetched.sort((a, b) => (a.isRead ? 1 : 0) - (b.isRead ? 1 : 0));
    setArticles(fetched);
    setLoading(false);
  }, [tab]);

  const loadDraftCount = useCallback(async () => {
    const count = await articleService.getDraftCount();
    setDraftCount(count);
  }, []);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  useEffect(() => {
    loadDraftCount();
  }, []);

  const handleApprove = useCallback(async (article: Article) => {
    try {
      const editedSummary = editedSummaries[article.id];
      const summaryToSave = editedSummary !== undefined && editedSummary !== article.summary
        ? editedSummary
        : undefined;
      await articleService.approveArticle(article.id, summaryToSave);
      setArticles(prev => prev.filter(a => a.id !== article.id));
      // Only decrement badge if article wasn't already read (read articles don't count)
      if (!article.isRead) {
        setDraftCount(prev => Math.max(0, prev - 1));
      }
    } catch {
      Alert.alert('Error', 'Failed to approve article.');
    }
  }, [editedSummaries]);

  const handleReject = useCallback(async (article: Article) => {
    Alert.alert(
      'Reject Article',
      `Reject "${article.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              await articleService.rejectArticle(article.id);
              setArticles(prev => prev.filter(a => a.id !== article.id));
              if (!article.isRead) {
                setDraftCount(prev => Math.max(0, prev - 1));
              }
            } catch {
              Alert.alert('Error', 'Failed to reject article.');
            }
          },
        },
      ]
    );
  }, []);

  const handleMarkRead = useCallback(async (article: Article) => {
    try {
      await articleService.markArticleRead(article.id);
      setArticles(prev => {
        const updated = prev.map(a => a.id === article.id ? { ...a, isRead: true } : a);
        updated.sort((a, b) => (a.isRead ? 1 : 0) - (b.isRead ? 1 : 0));
        return updated;
      });
      setDraftCount(prev => Math.max(0, prev - 1));
    } catch {
      Alert.alert('Error', 'Failed to mark article as read.');
    }
  }, []);

  const handleMarkUnread = useCallback(async (article: Article) => {
    try {
      await articleService.markArticleUnread(article.id);
      setArticles(prev => {
        const updated = prev.map(a => a.id === article.id ? { ...a, isRead: false } : a);
        updated.sort((a, b) => (a.isRead ? 1 : 0) - (b.isRead ? 1 : 0));
        return updated;
      });
      setDraftCount(prev => prev + 1);
    } catch {
      Alert.alert('Error', 'Failed to mark article as unread.');
    }
  }, []);

  const handleOpenSource = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      // silently fail
    }
  }, []);

  const toggleEditing = useCallback((id: string) => {
    setEditingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const renderArticle = ({ item }: { item: Article }) => {
    const sourceColor = SOURCE_COLORS[item.source] || theme.primary;
    const isDraft = item.status === 'draft';
    const isRead = item.isRead === true;
    const editedSummary = editedSummaries[item.id];
    const isEditing = editingIds.has(item.id);

    return (
      <Card variant="elevated" style={[styles.articleCard, isRead && styles.articleCardRead]}>
        {/* Header row */}
        <View style={styles.articleHeader}>
          <View style={[styles.sourceBadge, { backgroundColor: sourceColor }]}>
            <Text style={styles.sourceBadgeText}>{item.source}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: STATUS_COLORS[item.status] }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
          {isRead && (
            <View style={styles.readBadge}>
              <Text style={styles.readBadgeText}>Read</Text>
            </View>
          )}
          <Text style={styles.timeText}>{getRelativeTime(item.publishedAt)}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.articleTitle, isRead && styles.articleTitleRead]}>{item.title}</Text>

        {/* Summary - tap Edit to modify */}
        {isDraft && isEditing ? (
          <TextInput
            style={styles.summaryInput}
            multiline
            autoFocus
            value={editedSummary !== undefined ? editedSummary : item.summary}
            onChangeText={(text) =>
              setEditedSummaries(prev => ({ ...prev, [item.id]: text }))
            }
            placeholder="AI-generated summary..."
            placeholderTextColor={COLORS.text.muted}
          />
        ) : (
          <Text style={[styles.articleSummary, isRead && styles.articleSummaryRead]}>
            {editedSummary !== undefined ? editedSummary : item.summary}
          </Text>
        )}

        {/* Category + Edit + Source */}
        <View style={styles.categoryRow}>
          <View style={[styles.categoryChip, { backgroundColor: theme.primary + '15' }]}>
            <Text style={[styles.categoryChipText, { color: theme.primary }]}>{item.category}</Text>
          </View>
          <View style={styles.categoryRowRight}>
            {isDraft && (
              <TouchableOpacity
                style={[styles.editButton, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }, isEditing && [styles.editButtonActive, { backgroundColor: theme.primary, borderColor: theme.primary }]]}
                onPress={() => toggleEditing(item.id)}
              >
                <Ionicons
                  name={isEditing ? 'checkmark' : 'create-outline'}
                  size={14}
                  color={isEditing ? COLORS.white : theme.primary}
                />
                <Text style={[styles.editButtonText, { color: theme.primary }, isEditing && styles.editButtonTextActive]}>
                  {isEditing ? 'Done' : 'Edit'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => handleOpenSource(item.sourceUrl)}>
              <Ionicons name="open-outline" size={16} color={theme.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Reviewer info for approved/rejected */}
        {item.reviewedBy && (
          <Text style={styles.reviewerInfo}>
            Reviewed by {item.reviewedBy}{item.reviewedAt ? ` ${getRelativeTime(item.reviewedAt)}` : ''}
          </Text>
        )}

        {/* Action buttons for drafts */}
        {isDraft && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.approveButton}
              onPress={() => handleApprove(item)}
            >
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
              <Text style={styles.approveButtonText}>Approve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleReject(item)}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.white} />
              <Text style={styles.rejectButtonText}>Reject</Text>
            </TouchableOpacity>
            {isRead ? (
              <TouchableOpacity
                style={[styles.markUnreadButton, { backgroundColor: theme.primary + '25', borderColor: theme.primary + '50' }]}
                onPress={() => handleMarkUnread(item)}
              >
                <Ionicons name="eye" size={18} color={theme.primary} />
                <Text style={[styles.markUnreadButtonText, { color: theme.primary }]}>Unread</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.markReadButton}
                onPress={() => handleMarkRead(item)}
              >
                <Ionicons name="eye-off" size={18} color={COLORS.white} />
                <Text style={styles.markReadButtonText}>Read</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={articles}
        keyExtractor={item => item.id}
        renderItem={renderArticle}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="newspaper" size={24} color={theme.primary} />
                <Text style={styles.headerTitle}>News Management</Text>
              </View>
              <TouchableOpacity
                onPress={() => { loadArticles(); loadDraftCount(); }}
                style={[styles.refreshButton, { backgroundColor: theme.primary + '15' }]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Ionicons name="refresh" size={20} color={theme.primary} />
                )}
              </TouchableOpacity>
            </View>

            {/* Draft count */}
            {draftCount > 0 && (
              <View style={styles.draftBanner}>
                <Ionicons name="document-text-outline" size={16} color={COLORS.warning} />
                <Text style={styles.draftBannerText}>
                  {draftCount} article{draftCount !== 1 ? 's' : ''} awaiting review
                </Text>
              </View>
            )}

            {/* Tab chips */}
            <View style={styles.tabRow}>
              {(['draft', 'approved', 'rejected'] as TabFilter[]).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.tabChip,
                    tab === t && styles.tabChipActive,
                    tab === t && { borderColor: STATUS_COLORS[t] },
                  ]}
                  onPress={() => setTab(t)}
                >
                  <Text style={[
                    styles.tabChipText,
                    tab === t && { color: STATUS_COLORS[t], fontWeight: '700' },
                  ]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                  {t === 'draft' && draftCount > 0 && (
                    <View style={[styles.tabBadge, { backgroundColor: STATUS_COLORS.draft }]}>
                      <Text style={styles.tabBadgeText}>{draftCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.listCount}>
              {articles.length} article{articles.length !== 1 ? 's' : ''}
            </Text>
          </>
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="newspaper-outline"
              title={`No ${tab} Articles`}
              message={tab === 'draft'
                ? 'The AI news fetcher hasn\'t created any drafts yet'
                : `No articles have been ${tab}`}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },
  refreshButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary + '15',
  },

  draftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.warning + '15',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.md,
  },
  draftBannerText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.warning,
  },

  tabRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  tabChipActive: {
    backgroundColor: COLORS.card,
  },
  tabChipText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '500',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },

  listCount: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },

  articleCard: {
    marginBottom: SPACING.sm,
    padding: SPACING.md,
  },
  articleCardRead: {
    opacity: 0.7,
  },

  articleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
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
  statusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  timeText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginLeft: 'auto',
  },

  readBadge: {
    backgroundColor: COLORS.text.muted + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  readBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.text.muted,
  },

  articleTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '700',
    color: COLORS.text.primary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  articleTitleRead: {
    color: COLORS.text.muted,
  },

  articleSummary: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  articleSummaryRead: {
    color: COLORS.text.muted,
  },

  summaryInput: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    lineHeight: 18,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    padding: SPACING.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  categoryRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  editButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  editButtonText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },
  editButtonTextActive: {
    color: COLORS.white,
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
    textTransform: 'capitalize',
  },

  reviewerInfo: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginBottom: SPACING.sm,
  },

  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
    paddingTop: SPACING.sm,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.md,
  },
  approveButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.md,
  },
  rejectButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  markReadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.text.secondary,
    borderRadius: BORDER_RADIUS.md,
  },
  markUnreadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.primary + '25',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '50',
  },
  markReadButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  markUnreadButtonText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },
});
