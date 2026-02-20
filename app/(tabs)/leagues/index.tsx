import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useLeagueStore } from '../../../src/store/league.store';
import { useTeamStore } from '../../../src/store/team.store';
import { Card, Loading, EmptyState, Button, Avatar } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { useScale } from '../../../src/hooks/useScale';
import { validateInviteCode } from '../../../src/utils/validation';
import type { League } from '../../../src/types';

export default function LeaguesScreen() {
  const { scaledFonts, scaledSpacing, scaledIcon } = useScale();
  const theme = useTheme();
  const { user } = useAuth();
  const { join, code } = useLocalSearchParams<{ join?: string; code?: string }>();
  const leagues = useLeagueStore(s => s.leagues);
  const pendingLeagueIds = useLeagueStore(s => s.pendingLeagueIds);
  const isLoading = useLeagueStore(s => s.isLoading);
  const error = useLeagueStore(s => s.error);
  const loadUserLeagues = useLeagueStore(s => s.loadUserLeagues);
  const joinLeagueByCode = useLeagueStore(s => s.joinLeagueByCode);
  const clearError = useLeagueStore(s => s.clearError);

  const currentTeam = useTeamStore(s => s.currentTeam);
  const assignTeamToLeague = useTeamStore(s => s.assignTeamToLeague);

  const [refreshing, setRefreshing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // Leagues the current team could be assigned to (user's leagues that the team isn't already in)
  const availableLeagues = leagues.filter(
    (l) => currentTeam && !currentTeam.leagueId && l.id !== currentTeam.leagueId
  );

  useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
    }
  }, [user]);

  // Reload leagues when screen comes into focus (handles returning from create/join flows)
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadUserLeagues(user.id);
      }
    }, [user])
  );

  // Auto-open join modal if navigated with ?join=true, auto-fill code if provided
  useEffect(() => {
    if (join === 'true') {
      if (code) {
        setInviteCode(code.toUpperCase());
      }
      setShowJoinModal(true);
    }
  }, [join, code]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadUserLeagues(user.id);
    }
    setRefreshing(false);
  };

  const handleAssignToLeague = async (league: League) => {
    if (!currentTeam || !user) return;

    setJoining(true);
    try {
      await assignTeamToLeague(currentTeam.id, league.id);
      setShowJoinModal(false);
      Alert.alert(
        'Success',
        `Your team "${currentTeam.name}" is now competing in ${league.name}!`,
        [
          {
            text: 'View League',
            onPress: () => router.push(`/leagues/${league.id}`),
          },
          {
            text: 'View Team',
            onPress: () => router.push('/my-team'),
          },
        ]
      );
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to assign team to league');
    } finally {
      setJoining(false);
    }
  };

  const handleJoinLeague = async () => {
    setJoinError(null);
    const validation = validateInviteCode(inviteCode);

    if (!validation.isValid) {
      setJoinError(validation.error!);
      return;
    }

    if (!user) return;

    setJoining(true);
    try {
      await joinLeagueByCode(inviteCode.trim().toUpperCase(), user.id, user.displayName);
      setShowJoinModal(false);
      setInviteCode('');

      // Get the newly joined league
      const { currentLeague, pendingLeagueIds: updatedPendingIds } = useLeagueStore.getState();

      // Check if the user is pending approval
      if (currentLeague && updatedPendingIds.includes(currentLeague.id)) {
        Alert.alert(
          'Request Sent',
          `Your request to join "${currentLeague.name}" has been sent. The league admin will review your request.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const { userTeams, currentTeam, assignTeamToLeague } = useTeamStore.getState();

      // Check if user already has a team in this league
      const existingTeamInLeague = currentLeague
        ? userTeams.find(t => t.leagueId === currentLeague.id)
        : null;

      if (existingTeamInLeague) {
        // User already has a team in this league
        Alert.alert(
          'Already in League',
          `You already have a team "${existingTeamInLeague.name}" in this league.`,
          [
            {
              text: 'View League',
              onPress: () => {
                if (currentLeague) {
                  router.push(`/leagues/${currentLeague.id}`);
                }
              },
            },
            {
              text: 'View Team',
              onPress: () => {
                router.push('/my-team');
              },
            },
          ]
        );
      } else {
        // Check if user has a solo team (team without a league) to link
        const soloTeam = currentTeam && !currentTeam.leagueId ? currentTeam : userTeams.find(t => !t.leagueId);

        if (soloTeam && currentLeague) {
          // Link the solo team to the joined league
          await assignTeamToLeague(soloTeam.id, currentLeague.id);

          Alert.alert(
            'Success',
            `You have joined the league! Your team "${soloTeam.name}" is now competing in ${currentLeague.name}.`,
            [
              {
                text: 'View League',
                onPress: () => {
                  router.push(`/leagues/${currentLeague.id}`);
                },
              },
              {
                text: 'View Team',
                onPress: () => {
                  router.push('/my-team');
                },
              },
            ]
          );
        } else {
          // No solo team to link
          Alert.alert(
            'Success',
            'You have joined the league! Have fun enjoying the game with friends!',
            [
              {
                text: 'OK',
                onPress: () => {
                  if (currentLeague) {
                    router.push(`/leagues/${currentLeague.id}`);
                  }
                },
              },
            ]
          );
        }
      }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  const renderLeagueItem = ({ item }: { item: League }) => {
    const isPending = pendingLeagueIds.includes(item.id);

    return (
      <Card
        variant="elevated"
        style={styles.leagueCard}
        onPress={() => router.push(`/leagues/${item.id}`)}
      >
        <View style={styles.leagueHeader}>
          <Avatar name={item.name} size="large" variant="league" imageUrl={item.avatarUrl} />
          <View style={styles.leagueInfo}>
            <Text style={[styles.leagueName, { fontSize: scaledFonts.lg }]}>{item.name}</Text>
            <Text style={[styles.leagueMembers, { fontSize: scaledFonts.sm }]}>
              {item.memberCount} / {item.maxMembers} members
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={scaledIcon(20)} color={COLORS.text.muted} />
        </View>

        {isPending && (
          <View style={styles.pendingBadge}>
            <Ionicons name="hourglass-outline" size={14} color={COLORS.warning} />
            <Text style={styles.pendingBadgeText}>Pending Approval</Text>
          </View>
        )}

        {item.description && (
          <Text style={[styles.leagueDescription, { fontSize: scaledFonts.sm }]} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.leagueMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="person-outline" size={14} color={COLORS.text.muted} />
            <Text style={[styles.metaText, { fontSize: scaledFonts.sm }]}>{item.ownerName}</Text>
          </View>
          {item.isPublic && (
            <View style={styles.publicBadge}>
              <Text style={styles.publicText}>Public</Text>
            </View>
          )}
        </View>
      </Card>
    );
  };

  if (isLoading && !refreshing) {
    return <Loading fullScreen message="Loading leagues..." />;
  }

  return (
    <View style={styles.container}>
      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { borderColor: theme.primary }]}
          onPress={() => router.push('/leagues/create')}
        >
          <Ionicons name="add-circle" size={scaledIcon(20)} color={theme.primary} />
          <Text style={[styles.actionButtonText, { fontSize: scaledFonts.md, color: theme.primary }]}>Create League</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, { borderColor: theme.primary }]}
          onPress={() => setShowJoinModal(true)}
        >
          <Ionicons name="enter" size={scaledIcon(20)} color={theme.primary} />
          <Text style={[styles.actionButtonText, { fontSize: scaledFonts.md, color: theme.primary }]}>Join with Code</Text>
        </TouchableOpacity>
      </View>

      {/* Join Modal */}
      {showJoinModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Join League</Text>

            {/* Show existing leagues the team can be assigned to */}
            {availableLeagues.length > 0 && (
              <>
                <Text style={styles.modalDescription}>
                  Select one of your leagues
                </Text>
                <View style={styles.leaguePickerList}>
                  {availableLeagues.map((league) => (
                    <TouchableOpacity
                      key={league.id}
                      style={styles.leaguePickerItem}
                      onPress={() => handleAssignToLeague(league)}
                      disabled={joining}
                    >
                      <Avatar name={league.name} size="small" variant="league" imageUrl={league.avatarUrl} />
                      <View style={styles.leaguePickerInfo}>
                        <Text style={styles.leaguePickerName}>{league.name}</Text>
                        <Text style={styles.leaguePickerMeta}>
                          {league.memberCount} members
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.text.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.modalDivider}>
                  <View style={styles.modalDividerLine} />
                  <Text style={styles.modalDividerText}>or join with code</Text>
                  <View style={styles.modalDividerLine} />
                </View>
              </>
            )}

            {availableLeagues.length === 0 && (
              <Text style={styles.modalDescription}>
                Enter the invite code shared by the league admin
              </Text>
            )}

            <TextInput
              style={styles.codeInput}
              placeholder="Enter code"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              maxLength={8}
              placeholderTextColor={COLORS.text.muted}
            />

            {joinError && <Text style={styles.errorText}>{joinError}</Text>}

            <View style={styles.modalButtons}>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  setShowJoinModal(false);
                  setInviteCode('');
                  setJoinError(null);
                }}
              />
              <Button
                title="Join"
                onPress={handleJoinLeague}
                loading={joining}
              />
            </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* Leagues List */}
      {leagues.length > 0 ? (
        <FlatList
          data={leagues}
          keyExtractor={(item) => item.id}
          renderItem={renderLeagueItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: theme.primary + '20' }]}>
            <Ionicons name="trophy" size={scaledIcon(48)} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { fontSize: scaledFonts.xxl }]}>No Leagues Yet</Text>
          <Text style={[styles.emptyMessage, { fontSize: scaledFonts.md }]}>
            Compete with friends and track your standings together
          </Text>

          {/* Join with Code Card */}
          <Card variant="elevated" style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <Ionicons name="enter" size={24} color={COLORS.accent} />
              <Text style={[styles.optionTitle, { fontSize: scaledFonts.lg }]}>Join with Code</Text>
            </View>
            <Text style={[styles.optionDescription, { fontSize: scaledFonts.sm }]}>
              Have an invite code? Enter it below to join an existing league.
            </Text>
            <TextInput
              style={styles.inlineCodeInput}
              placeholder="ENTER CODE"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              maxLength={8}
              placeholderTextColor={COLORS.text.muted}
            />
            {joinError && <Text style={styles.inlineErrorText}>{joinError}</Text>}
            <Button
              title={joining ? "Joining..." : "Join League"}
              onPress={handleJoinLeague}
              loading={joining}
              disabled={!inviteCode.trim()}
              fullWidth
            />
          </Card>

          {/* Create League Card */}
          <Card variant="outlined" style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <Ionicons name="add-circle" size={24} color={theme.primary} />
              <Text style={[styles.optionTitle, { fontSize: scaledFonts.lg }]}>Create Your Own</Text>
            </View>
            <Text style={[styles.optionDescription, { fontSize: scaledFonts.sm }]}>
              Start a new league and invite your friends to compete.
            </Text>
            <Button
              title="Create League"
              variant="outline"
              onPress={() => router.push('/leagues/create')}
              fullWidth
            />
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  actions: {
    flexDirection: 'row',
    padding: SPACING.md,
    gap: SPACING.md,
  },

  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: SPACING.sm,
  },

  actionButtonText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },

  leagueCard: {
    marginBottom: SPACING.md,
  },

  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },

  leagueInfo: {
    flex: 1,
  },

  leagueName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  leagueMembers: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  leagueDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.md,
    lineHeight: 20,
  },

  leagueMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border.default,
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  metaText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  publicBadge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },

  publicText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.success,
  },

  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },

  modal: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '85%',
    maxWidth: 400,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  modalTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },

  modalDescription: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    marginBottom: SPACING.lg,
  },

  codeInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONTS.sizes.xl,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: SPACING.md,
    color: COLORS.text.primary,
  },

  errorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    marginBottom: SPACING.md,
  },

  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,
  },

  // Empty State Styles
  emptyContainer: {
    flex: 1,
    padding: SPACING.lg,
    alignItems: 'center',
  },

  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    marginTop: SPACING.xl,
  },

  emptyTitle: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },

  emptyMessage: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },

  optionCard: {
    width: '100%',
    marginBottom: SPACING.md,
    padding: SPACING.lg,
  },

  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  optionTitle: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  optionDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.md,
    lineHeight: 20,
  },

  inlineCodeInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: SPACING.md,
    color: COLORS.text.primary,
  },

  inlineErrorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },

  leaguePickerList: {
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },

  leaguePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  leaguePickerInfo: {
    flex: 1,
  },

  leaguePickerName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  leaguePickerMeta: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  modalDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },

  modalDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border.default,
  },

  modalDividerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.warning + '15',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },

  pendingBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '600',
    color: COLORS.warning,
  },
});
