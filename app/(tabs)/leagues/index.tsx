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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useLeagueStore } from '../../../src/store/league.store';
import { useTeamStore } from '../../../src/store/team.store';
import { Card, Loading, EmptyState, Button, Avatar } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS } from '../../../src/config/constants';
import { validateInviteCode } from '../../../src/utils/validation';
import type { League } from '../../../src/types';

export default function LeaguesScreen() {
  const { user } = useAuth();
  const { join } = useLocalSearchParams<{ join?: string }>();
  const {
    leagues,
    isLoading,
    error,
    loadUserLeagues,
    joinLeagueByCode,
    clearError,
  } = useLeagueStore();

  const [refreshing, setRefreshing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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

  // Auto-open join modal if navigated with ?join=true
  useEffect(() => {
    if (join === 'true') {
      setShowJoinModal(true);
    }
  }, [join]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (user) {
      await loadUserLeagues(user.id);
    }
    setRefreshing(false);
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
      const { currentLeague } = useLeagueStore.getState();
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

  const renderLeagueItem = ({ item }: { item: League }) => (
    <Card
      variant="elevated"
      style={styles.leagueCard}
      onPress={() => router.push(`/leagues/${item.id}`)}
    >
      <View style={styles.leagueHeader}>
        <Avatar name={item.name} size="large" variant="league" imageUrl={item.avatarUrl} />
        <View style={styles.leagueInfo}>
          <Text style={styles.leagueName}>{item.name}</Text>
          <Text style={styles.leagueMembers}>
            {item.memberCount} / {item.maxMembers} members
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.gray[400]} />
      </View>

      {item.description && (
        <Text style={styles.leagueDescription} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.leagueMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="person-outline" size={14} color={COLORS.gray[500]} />
          <Text style={styles.metaText}>{item.ownerName}</Text>
        </View>
        {item.isPublic && (
          <View style={styles.publicBadge}>
            <Text style={styles.publicText}>Public</Text>
          </View>
        )}
      </View>
    </Card>
  );

  if (isLoading && !refreshing) {
    return <Loading fullScreen message="Loading leagues..." />;
  }

  return (
    <View style={styles.container}>
      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push('/leagues/create')}
        >
          <Ionicons name="add-circle" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Create League</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowJoinModal(true)}
        >
          <Ionicons name="enter" size={20} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>Join with Code</Text>
        </TouchableOpacity>
      </View>

      {/* Join Modal */}
      {showJoinModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Join League</Text>
            <Text style={styles.modalDescription}>
              Enter the invite code shared by the league admin
            </Text>

            <TextInput
              style={styles.codeInput}
              placeholder="Enter code"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="characters"
              maxLength={8}
              placeholderTextColor={COLORS.gray[400]}
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
        <EmptyState
          icon="trophy-outline"
          title="No Leagues Yet"
          message="Create your own league or join one with an invite code to start competing"
          actionLabel="Create League"
          onAction={() => router.push('/leagues/create')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray[50],
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
    backgroundColor: COLORS.white,
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
    color: COLORS.gray[900],
  },

  leagueMembers: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
    marginTop: 2,
  },

  leagueDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[600],
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
    borderTopColor: COLORS.gray[100],
  },

  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },

  metaText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.gray[500],
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },

  modal: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '85%',
    maxWidth: 400,
  },

  modalTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.gray[900],
    marginBottom: SPACING.sm,
  },

  modalDescription: {
    fontSize: FONTS.sizes.md,
    color: COLORS.gray[600],
    marginBottom: SPACING.lg,
  },

  codeInput: {
    backgroundColor: COLORS.gray[50],
    borderWidth: 1,
    borderColor: COLORS.gray[200],
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONTS.sizes.xl,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: SPACING.md,
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
});
