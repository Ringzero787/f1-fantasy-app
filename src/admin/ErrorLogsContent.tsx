import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, EmptyState } from '../components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../config/constants';
import { errorLogService, ErrorLogEntry } from '../services/errorLog.service';

type SeverityFilter = 'all' | 'error' | 'warn' | 'info';
type TimeFilter = '24h' | '7d' | '30d' | 'all';

const SEVERITY_COLORS: Record<string, string> = {
  error: COLORS.error,
  warn: COLORS.warning,
  info: COLORS.info,
};

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

function getTimeThreshold(filter: TimeFilter): number {
  const now = Date.now();
  switch (filter) {
    case '24h': return now - 24 * 60 * 60 * 1000;
    case '7d': return now - 7 * 24 * 60 * 60 * 1000;
    case '30d': return now - 30 * 24 * 60 * 60 * 1000;
    case 'all': return 0;
  }
}

interface IssueGroup {
  key: string;
  context: string;
  message: string;
  count: number;
  severity: string;
  entries: ErrorLogEntry[];
}

export default function ErrorLogsContent() {
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [hideReviewed, setHideReviewed] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const fetched = await errorLogService.fetchLogs(200);
    setLogs(fetched);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Apply time filter + hide reviewed
  const timeFiltered = useMemo(() => {
    let result = logs;
    const threshold = getTimeThreshold(timeFilter);
    if (threshold > 0) {
      result = result.filter(l => l.createdAt.getTime() >= threshold);
    }
    if (hideReviewed) {
      result = result.filter(l => !l.reviewed);
    }
    return result;
  }, [logs, timeFilter, hideReviewed]);

  // Apply severity filter
  const filtered = useMemo(() => {
    if (severityFilter === 'all') return timeFiltered;
    return timeFiltered.filter(l => l.severity === severityFilter);
  }, [timeFiltered, severityFilter]);

  // Counts by severity (from time-filtered, before severity filter)
  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    timeFiltered.forEach(l => {
      if (l.severity in c) c[l.severity as keyof typeof c]++;
    });
    return c;
  }, [timeFiltered]);

  // Top issues (grouped by context+message)
  const topIssues = useMemo(() => {
    const map = new Map<string, IssueGroup>();
    timeFiltered.forEach(entry => {
      const key = `${entry.context}::${entry.message}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.entries.push(entry);
      } else {
        map.set(key, {
          key,
          context: entry.context,
          message: entry.message,
          count: 1,
          severity: entry.severity,
          entries: [entry],
        });
      }
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [timeFiltered]);

  const [bulkClosing, setBulkClosing] = useState<string | null>(null);

  // Format a single log entry as text
  const formatLogEntry = useCallback((entry: ErrorLogEntry): string => {
    const lines = [
      `[${entry.severity.toUpperCase()}] ${entry.context}`,
      `Message: ${entry.message}`,
      `Time: ${entry.createdAt.toLocaleString()}`,
      `User: ${entry.userId}`,
      `Device: ${entry.deviceInfo}`,
      `Version: ${entry.appVersion}`,
    ];
    if (entry.stack) lines.push(`Stack:\n${entry.stack}`);
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      lines.push(`Metadata: ${JSON.stringify(entry.metadata, null, 2)}`);
    }
    return lines.join('\n');
  }, []);

  // Share a single log entry
  const handleCopyLog = useCallback(async (entry: ErrorLogEntry) => {
    try {
      await Share.share({
        message: formatLogEntry(entry),
        title: `Error: ${entry.context}`,
      });
    } catch (_) {
      // User cancelled
    }
  }, [formatLogEntry]);

  // Export all visible logs
  const handleExportLogs = useCallback(async () => {
    if (filtered.length === 0) {
      Alert.alert('No Logs', 'There are no logs to export with the current filters.');
      return;
    }

    const header = [
      `Undercut Error Report`,
      `Generated: ${new Date().toLocaleString()}`,
      `Filters: severity=${severityFilter}, time=${timeFilter}, hideReviewed=${hideReviewed}`,
      `Total: ${filtered.length} log(s)`,
      '',
      '---',
      '',
    ].join('\n');

    const body = filtered
      .slice(0, 50) // Cap at 50 for share limits
      .map((entry, i) => `#${i + 1}\n${formatLogEntry(entry)}`)
      .join('\n\n---\n\n');

    const footer = filtered.length > 50
      ? `\n\n--- (showing 50 of ${filtered.length} logs) ---`
      : '';

    const report = header + body + footer;

    try {
      await Share.share({
        message: report,
        title: 'Undercut Error Report',
      });
    } catch (_) {
      // User cancelled
    }
  }, [filtered, severityFilter, timeFilter, hideReviewed, formatLogEntry]);

  const handleMarkReviewed = useCallback(async (logId: string) => {
    await errorLogService.markLogReviewed(logId);
    setLogs(prev => prev.map(l => l.id === logId ? { ...l, reviewed: true } : l));
  }, []);

  const handleBulkClose = useCallback(async (group: IssueGroup) => {
    const unreviewedIds = group.entries.filter(e => !e.reviewed).map(e => e.id);
    if (unreviewedIds.length === 0) return;
    setBulkClosing(group.key);
    // Update local state optimistically (Firebase may fail in demo mode)
    const idSet = new Set(unreviewedIds);
    setLogs(prev => prev.map(l => idSet.has(l.id) ? { ...l, reviewed: true } : l));
    // Best-effort persist to Firebase
    await errorLogService.bulkMarkReviewed(unreviewedIds);
    setBulkClosing(null);
  }, []);

  const [bulkDeleting, setBulkDeleting] = useState<string | null>(null);

  const handleBulkDelete = useCallback(async (group: IssueGroup) => {
    const ids = group.entries.map(e => e.id);
    Alert.alert(
      'Delete Logs',
      `Permanently delete all ${ids.length} "${group.context}" logs from Firestore?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBulkDeleting(group.key);
            const idSet = new Set(ids);
            setLogs(prev => prev.filter(l => !idSet.has(l.id)));
            await errorLogService.bulkDelete(ids);
            setBulkDeleting(null);
          },
        },
      ]
    );
  }, []);

  const handleDeleteAllVisible = useCallback(async () => {
    if (filtered.length === 0) return;
    Alert.alert(
      'Delete All Visible',
      `Permanently delete ${filtered.length} log(s) from Firestore? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            const ids = filtered.map(l => l.id);
            const idSet = new Set(ids);
            setLogs(prev => prev.filter(l => !idSet.has(l.id)));
            await errorLogService.bulkDelete(ids);
          },
        },
      ]
    );
  }, [filtered]);

  const renderLogItem = ({ item }: { item: ErrorLogEntry }) => {
    const isExpanded = expandedLog === item.id;
    return (
      <TouchableOpacity
        style={[styles.logItem, item.reviewed && styles.logItemReviewed]}
        onPress={() => setExpandedLog(isExpanded ? null : item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.logItemHeader}>
          <View
            style={[styles.severityDot, { backgroundColor: SEVERITY_COLORS[item.severity] || COLORS.text.muted }]}
          />
          <Text style={styles.logContext} numberOfLines={1}>{item.context}</Text>
          {item.reviewed && (
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
          )}
          <Text style={styles.logTime}>{getRelativeTime(item.createdAt)}</Text>
        </View>
        <Text style={[styles.logMessage, item.reviewed && styles.logMessageReviewed]} numberOfLines={isExpanded ? undefined : 2}>
          {item.message}
        </Text>
        {isExpanded && (
          <View style={styles.logDetails}>
            {item.stack && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Stack</Text>
                <Text style={styles.detailValue} numberOfLines={8}>{item.stack}</Text>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>User</Text>
              <Text style={styles.detailValue}>{item.userId}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Device</Text>
              <Text style={styles.detailValue}>{item.deviceInfo}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Version</Text>
              <Text style={styles.detailValue}>{item.appVersion}</Text>
            </View>
            {item.metadata && Object.keys(item.metadata).length > 0 && (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>Metadata</Text>
                <Text style={styles.detailValue}>{JSON.stringify(item.metadata, null, 2)}</Text>
              </View>
            )}
            <View style={styles.detailFooter}>
              <Text style={styles.detailTimestamp}>
                {item.createdAt.toLocaleString()}
              </Text>
              <View style={styles.detailActions}>
                <TouchableOpacity
                  style={styles.copyLogButton}
                  onPress={() => handleCopyLog(item)}
                >
                  <Ionicons name="copy-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.copyLogText}>Copy</Text>
                </TouchableOpacity>
                {!item.reviewed && (
                  <TouchableOpacity
                    style={styles.markReviewedButton}
                    onPress={() => handleMarkReviewed(item.id)}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                    <Text style={styles.markReviewedText}>Mark Reviewed</Text>
                  </TouchableOpacity>
                )}
                {item.reviewed && (
                  <View style={styles.reviewedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                    <Text style={styles.reviewedBadgeText}>Reviewed</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderLogItem}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="alert-circle" size={24} color={COLORS.error} />
                <Text style={styles.headerTitle}>Error Logs</Text>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  onPress={() => setHideReviewed(!hideReviewed)}
                  style={[styles.hideReviewedToggle, hideReviewed && styles.hideReviewedToggleActive]}
                >
                  <Ionicons
                    name={hideReviewed ? 'eye-off' : 'eye'}
                    size={16}
                    color={hideReviewed ? COLORS.success : COLORS.text.muted}
                  />
                  <Text style={[styles.hideReviewedText, hideReviewed && styles.hideReviewedTextActive]}>
                    {hideReviewed ? 'Closed Hidden' : 'Show All'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleDeleteAllVisible} style={styles.deleteAllButton}>
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleExportLogs} style={styles.exportButton}>
                  <Ionicons name="share-outline" size={18} color={COLORS.white} />
                </TouchableOpacity>
                <TouchableOpacity onPress={loadLogs} style={styles.refreshButton}>
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <Ionicons name="refresh" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Summary Row */}
            <View style={styles.summaryRow}>
              <View style={[styles.statCard, { borderColor: COLORS.error + '40' }]}>
                <Text style={[styles.statValue, { color: COLORS.error }]}>{counts.error}</Text>
                <Text style={styles.statLabel}>Errors</Text>
              </View>
              <View style={[styles.statCard, { borderColor: COLORS.warning + '40' }]}>
                <Text style={[styles.statValue, { color: COLORS.warning }]}>{counts.warn}</Text>
                <Text style={styles.statLabel}>Warnings</Text>
              </View>
              <View style={[styles.statCard, { borderColor: COLORS.info + '40' }]}>
                <Text style={[styles.statValue, { color: COLORS.info }]}>{counts.info}</Text>
                <Text style={styles.statLabel}>Info</Text>
              </View>
            </View>

            {/* Top Issues */}
            {topIssues.length > 0 && (
              <Card variant="elevated" style={styles.topIssuesCard}>
                <Text style={styles.sectionTitle}>Top Issues</Text>
                {topIssues.map(group => {
                  const isGroupExpanded = expandedGroup === group.key;
                  const unreviewedCount = group.entries.filter(e => !e.reviewed).length;
                  const isBulkClosing = bulkClosing === group.key;
                  const allReviewed = unreviewedCount === 0;
                  return (
                    <View
                      key={group.key}
                      style={[styles.issueRow, allReviewed && styles.issueRowReviewed]}
                    >
                      <TouchableOpacity
                        style={styles.issueHeader}
                        onPress={() => setExpandedGroup(isGroupExpanded ? null : group.key)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.countBadge, { backgroundColor: SEVERITY_COLORS[group.severity] + '25' }]}>
                          <Text style={[styles.countText, { color: SEVERITY_COLORS[group.severity] }]}>
                            {group.count}
                          </Text>
                        </View>
                        <View style={styles.issueInfo}>
                          <Text style={styles.issueContext}>{group.context}</Text>
                          <Text style={styles.issueMessage} numberOfLines={isGroupExpanded ? undefined : 1}>
                            {group.message}
                          </Text>
                        </View>
                        {allReviewed ? (
                          <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                        ) : (
                          <TouchableOpacity
                            style={styles.issueCloseButton}
                            onPress={() => handleBulkClose(group)}
                            disabled={isBulkClosing}
                            hitSlop={8}
                          >
                            {isBulkClosing ? (
                              <ActivityIndicator size="small" color={COLORS.success} />
                            ) : (
                              <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.success} />
                            )}
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                      {isGroupExpanded && (
                        <View style={styles.issueEntries}>
                          {group.entries.slice(0, 5).map(entry => (
                            <View key={entry.id} style={[styles.issueEntry, entry.reviewed && { opacity: 0.5 }]}>
                              <Text style={styles.issueEntryTime}>{getRelativeTime(entry.createdAt)}</Text>
                              <Text style={styles.issueEntryUser}>{entry.userId}</Text>
                              {entry.reviewed && (
                                <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                              )}
                              <Text style={styles.issueEntryDevice}>{entry.deviceInfo}</Text>
                            </View>
                          ))}
                          {group.entries.length > 5 && (
                            <Text style={styles.moreEntriesText}>
                              +{group.entries.length - 5} more
                            </Text>
                          )}
                          <View style={styles.issueActions}>
                            {unreviewedCount > 0 && (
                              <TouchableOpacity
                                style={styles.bulkCloseButton}
                                onPress={() => handleBulkClose(group)}
                                disabled={isBulkClosing}
                              >
                                {isBulkClosing ? (
                                  <ActivityIndicator size="small" color={COLORS.success} />
                                ) : (
                                  <Ionicons name="checkmark-done" size={16} color={COLORS.success} />
                                )}
                                <Text style={styles.bulkCloseText}>
                                  {isBulkClosing
                                    ? 'Closing...'
                                    : `Close All ${unreviewedCount} Similar`}
                                </Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={styles.bulkDeleteButton}
                              onPress={() => handleBulkDelete(group)}
                              disabled={bulkDeleting === group.key}
                            >
                              {bulkDeleting === group.key ? (
                                <ActivityIndicator size="small" color={COLORS.error} />
                              ) : (
                                <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                              )}
                              <Text style={styles.bulkDeleteText}>
                                {bulkDeleting === group.key ? 'Deleting...' : `Delete All ${group.count}`}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
              </Card>
            )}

            {/* Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
              <View style={styles.filterRow}>
                {(['all', 'error', 'warn', 'info'] as SeverityFilter[]).map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.filterChip,
                      severityFilter === s && styles.filterChipActive,
                      severityFilter === s && s !== 'all' && {
                        backgroundColor: SEVERITY_COLORS[s] + '25',
                        borderColor: SEVERITY_COLORS[s],
                      },
                    ]}
                    onPress={() => setSeverityFilter(s)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      severityFilter === s && styles.filterChipTextActive,
                      severityFilter === s && s !== 'all' && { color: SEVERITY_COLORS[s] },
                    ]}>
                      {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.filterDivider} />
                {(['24h', '7d', '30d', 'all'] as TimeFilter[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.filterChip,
                      timeFilter === t && styles.filterChipActive,
                    ]}
                    onPress={() => setTimeFilter(t)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      timeFilter === t && styles.filterChipTextActive,
                    ]}>
                      {t === 'all' ? 'All Time' : t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Log list section header */}
            <Text style={styles.listHeader}>
              {filtered.length} log{filtered.length !== 1 ? 's' : ''}
            </Text>
          </>
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="checkmark-circle"
              title="No Logs Found"
              message={severityFilter !== 'all' || timeFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'No error logs have been recorded yet'}
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

  // Header
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  hideReviewedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  hideReviewedToggleActive: {
    backgroundColor: COLORS.success + '12',
    borderColor: COLORS.success + '30',
  },
  hideReviewedText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.text.muted,
  },
  hideReviewedTextActive: {
    color: COLORS.success,
    fontWeight: '600',
  },
  exportButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  refreshButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary + '15',
  },

  // Summary row
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  statValue: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  // Top issues
  topIssuesCard: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },
  issueRow: {
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border.light,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  countBadge: {
    minWidth: 32,
    height: 24,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  countText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
  },
  issueInfo: {
    flex: 1,
  },
  issueContext: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  issueMessage: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    marginTop: 1,
  },
  issueEntries: {
    marginTop: SPACING.sm,
    marginLeft: 40,
    gap: SPACING.xs,
  },
  issueEntry: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  issueEntryTime: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    minWidth: 50,
  },
  issueEntryUser: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
    flex: 1,
  },
  issueEntryDevice: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },
  moreEntriesText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.primary,
    fontWeight: '500',
  },
  issueCloseButton: {
    padding: SPACING.xs,
  },
  issueRowReviewed: {
    opacity: 0.5,
  },
  issueActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  bulkCloseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.success + '12',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.success + '30',
  },
  bulkCloseText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.error + '12',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.error + '30',
  },
  bulkDeleteText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.error,
  },
  deleteAllButton: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.error + '15',
  },

  // Filters
  filtersScroll: {
    marginBottom: SPACING.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    paddingRight: SPACING.md,
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.border.default,
  },

  // Log list
  listHeader: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    fontWeight: '500',
    marginBottom: SPACING.sm,
  },
  logItem: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },
  logItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logContext: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '600',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logTime: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },
  logMessage: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.primary,
    lineHeight: 18,
  },

  // Log detail expansion
  logDetails: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
    gap: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailBlock: {
    gap: 2,
  },
  detailLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
  },
  detailTimestamp: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
  },
  detailFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.light,
  },
  markReviewedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.success + '15',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.success + '30',
  },
  markReviewedText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.success,
  },
  reviewedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  reviewedBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '500',
    color: COLORS.success,
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  copyLogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.primary + '15',
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  copyLogText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.primary,
  },
  logItemReviewed: {
    opacity: 0.6,
    borderColor: COLORS.success + '30',
  },
  logMessageReviewed: {
    color: COLORS.text.muted,
  },
});
