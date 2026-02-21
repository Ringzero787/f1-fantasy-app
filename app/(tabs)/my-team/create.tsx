import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useTeamStore } from '../../../src/store/team.store';
import { useLeagueStore } from '../../../src/store/league.store';
import { useDrivers, useConstructors } from '../../../src/hooks';
import { Input, Button } from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { validateTeamName } from '../../../src/utils/validation';
import { leagueService } from '../../../src/services/league.service';
import type { Driver, Constructor, League } from '../../../src/types';

// Generate a recommended team that maximizes budget usage
function generateRecommendedTeam(
  drivers: Driver[],
  constructors: Constructor[],
  budget: number
): { drivers: Driver[]; constructor: Constructor } | null {
  // Safety checks
  if (!drivers || !Array.isArray(drivers) || drivers.length < TEAM_SIZE) {
    console.log('generateRecommendedTeam: Not enough drivers', drivers?.length);
    return null;
  }
  if (!constructors || !Array.isArray(constructors) || constructors.length === 0) {
    console.log('generateRecommendedTeam: No constructors', constructors?.length);
    return null;
  }

  let bestTeam: { drivers: Driver[]; constructor: Constructor; totalSpent: number } | null = null;

  // Sort drivers by price descending for greedy selection
  const sortedDrivers = [...drivers].sort((a, b) => b.price - a.price);
  // Sort constructors by price ascending to leave more budget for drivers
  const sortedConstructors = [...constructors].sort((a, b) => a.price - b.price);

  // Try each constructor starting from cheapest
  for (const constructor of sortedConstructors) {
    let remainingBudget = budget - constructor.price;
    if (remainingBudget < 0) continue;

    const selectedDrivers: Driver[] = [];

    // Greedy: pick cheapest drivers first to ensure we can fit 5
    const cheapestDrivers = [...sortedDrivers].sort((a, b) => a.price - b.price);

    // First pass: ensure we CAN fit 5 drivers
    let testBudget = remainingBudget;
    let canFit = 0;
    for (const driver of cheapestDrivers) {
      if (driver.price <= testBudget) {
        testBudget -= driver.price;
        canFit++;
        if (canFit >= TEAM_SIZE) break;
      }
    }

    if (canFit < TEAM_SIZE) continue; // Can't fit 5 drivers with this constructor

    // Second pass: greedily pick expensive drivers while ensuring we can still fill the team
    const availableDrivers = [...sortedDrivers]; // sorted by price desc

    while (selectedDrivers.length < TEAM_SIZE && availableDrivers.length > 0) {
      const spotsLeft = TEAM_SIZE - selectedDrivers.length;

      // Find the most expensive driver we can afford while still being able to fill remaining spots
      let picked = false;
      for (let i = 0; i < availableDrivers.length; i++) {
        const candidate = availableDrivers[i];
        if (candidate.price > remainingBudget) continue;

        // Check if we can still fill remaining spots after picking this driver
        const budgetAfter = remainingBudget - candidate.price;
        const remainingDrivers = availableDrivers.filter((_, idx) => idx !== i);
        const cheapest = remainingDrivers.sort((a, b) => a.price - b.price).slice(0, spotsLeft - 1);
        const minCostToFill = cheapest.reduce((sum, d) => sum + d.price, 0);

        if (budgetAfter >= minCostToFill) {
          selectedDrivers.push(candidate);
          remainingBudget -= candidate.price;
          availableDrivers.splice(i, 1);
          picked = true;
          break;
        }
      }

      if (!picked) {
        // Fallback: just pick the cheapest affordable driver
        const affordable = availableDrivers.filter(d => d.price <= remainingBudget);
        if (affordable.length === 0) break;
        const cheapest = affordable.sort((a, b) => a.price - b.price)[0];
        selectedDrivers.push(cheapest);
        remainingBudget -= cheapest.price;
        const idx = availableDrivers.indexOf(cheapest);
        if (idx !== -1) availableDrivers.splice(idx, 1);
      }
    }

    if (selectedDrivers.length === TEAM_SIZE) {
      const totalSpent = budget - remainingBudget;
      if (!bestTeam || totalSpent > bestTeam.totalSpent) {
        bestTeam = { drivers: selectedDrivers, constructor, totalSpent };
      }
    }
  }

  return bestTeam;
}

type TeamMode = 'solo' | 'league';

export default function CreateTeamScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const leagues = useLeagueStore(s => s.leagues);
  const loadUserLeagues = useLeagueStore(s => s.loadUserLeagues);
  const recentlyCreatedLeague = useLeagueStore(s => s.recentlyCreatedLeague);
  const clearRecentlyCreatedLeague = useLeagueStore(s => s.clearRecentlyCreatedLeague);
  const createTeam = useTeamStore(s => s.createTeam);
  const userTeams = useTeamStore(s => s.userTeams);
  const isLoading = useTeamStore(s => s.isLoading);
  const error = useTeamStore(s => s.error);
  const setCurrentTeam = useTeamStore(s => s.setCurrentTeam);
  const clearError = useTeamStore(s => s.clearError);
  const { data: allDrivers, isLoading: driversLoading } = useDrivers();
  const { data: allConstructors, isLoading: constructorsLoading } = useConstructors();

  const [teamName, setTeamName] = useState('');
  const [teamMode, setTeamMode] = useState<TeamMode>('league');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCreatingRecommended, setIsCreatingRecommended] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLeague, setInviteLeague] = useState<League | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const hasCreated = useRef(false);

  // Auto-dismiss stale create modal when returning to this screen after team was already created
  useFocusEffect(
    useCallback(() => {
      if (hasCreated.current) {
        router.back();
      }
    }, [])
  );

  // Clear any stale errors from previous navigation
  React.useEffect(() => {
    clearError();
  }, []);

  // Load user leagues when component mounts
  React.useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
    }
  }, [user]);

  const dataLoading = driversLoading || constructorsLoading;

  // Auto-assign: first league that doesn't already have one of the user's teams
  const autoLeague = React.useMemo(() => {
    const leaguesWithTeams = new Set(
      userTeams.map(t => t.leagueId).filter(Boolean)
    );
    // Check recentlyCreatedLeague first (freshest)
    if (recentlyCreatedLeague && !leaguesWithTeams.has(recentlyCreatedLeague.id)) {
      return recentlyCreatedLeague;
    }
    return leagues.find(l => !leaguesWithTeams.has(l.id)) || null;
  }, [leagues, userTeams, recentlyCreatedLeague]);

  // The league to join: auto-assigned, from invite code, or null for solo
  const currentLeague = teamMode === 'league' ? (autoLeague || inviteLeague) : null;

  const handleLookupInviteCode = async () => {
    if (!inviteCode.trim()) return;
    setInviteError(null);
    setIsLookingUp(true);
    try {
      const league = await leagueService.getLeagueByCode(inviteCode.trim());
      if (!league) {
        setInviteError('No league found with that code');
        setInviteLeague(null);
      } else {
        setInviteLeague(league);
      }
    } catch {
      setInviteError('Failed to look up code');
      setInviteLeague(null);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleCreate = async () => {
    setValidationError(null);

    const validation = validateTeamName(teamName);
    if (!validation.isValid) {
      setValidationError(validation.error!);
      return;
    }

    if (!user) return;

    try {
      // If joining via invite code, join the league first
      if (inviteLeague && !autoLeague) {
        await leagueService.joinLeague(inviteLeague.id, user.id, user.displayName || 'Player');
      }

      await createTeam(user.id, currentLeague?.id || null, teamName.trim());
      hasCreated.current = true;

      if (recentlyCreatedLeague) {
        clearRecentlyCreatedLeague();
      }

      router.replace('/my-team');
    } catch (err) {
      // Error handled by store
    }
  };

  const handleCreateRecommended = async () => {
    setValidationError(null);

    const validation = validateTeamName(teamName);
    if (!validation.isValid) {
      setValidationError(validation.error!);
      return;
    }

    if (!user) {
      setValidationError('You must be logged in');
      return;
    }

    if (!allDrivers || allDrivers.length === 0) {
      setValidationError('Drivers data not loaded yet. Please wait a moment and try again.');
      return;
    }
    if (!allConstructors || allConstructors.length === 0) {
      setValidationError('Constructors data not loaded yet. Please wait a moment and try again.');
      return;
    }

    const recommended = generateRecommendedTeam(allDrivers, allConstructors, BUDGET);
    if (!recommended) {
      setValidationError(`Could not generate a recommended team with ${allDrivers.length} drivers and ${allConstructors.length} constructors within ${BUDGET} budget`);
      return;
    }

    setIsCreatingRecommended(true);
    try {
      // If joining via invite code, join the league first
      if (inviteLeague && !autoLeague) {
        await leagueService.joinLeague(inviteLeague.id, user.id, user.displayName || 'Player');
      }

      // Create the team first (support solo teams with null leagueId)
      await createTeam(user.id, currentLeague?.id || null, teamName.trim());

      // Build team atomically - convert Driver[] to FantasyDriver[]
      const totalCost = recommended.drivers.reduce((sum, d) => sum + d.price, 0) + recommended.constructor.price;

      const fantasyDrivers = recommended.drivers.map(driver => ({
        driverId: driver.id,
        name: driver.name,
        shortName: driver.shortName || driver.name.substring(0, 3).toUpperCase(),
        constructorId: driver.constructorId,
        purchasePrice: driver.price,
        currentPrice: driver.price,
        pointsScored: 0,
        racesHeld: 0,
      }));

      const fantasyConstructor = {
        constructorId: recommended.constructor.id,
        name: recommended.constructor.name,
        shortName: recommended.constructor.shortName || recommended.constructor.name.substring(0, 3).toUpperCase(),
        purchasePrice: recommended.constructor.price,
        currentPrice: recommended.constructor.price,
        pointsScored: 0,
        racesHeld: 0,
      };

      // Get the newly created team and update it atomically
      const newTeam = useTeamStore.getState().currentTeam;
      if (newTeam) {
        const updatedTeam = {
          ...newTeam,
          drivers: fantasyDrivers,
          constructor: fantasyConstructor,
          totalSpent: totalCost,
          budget: BUDGET - totalCost,
          racesSinceTransfer: 0,
          updatedAt: new Date(),
        };
        setCurrentTeam(updatedTeam);
      }

      hasCreated.current = true;

      // Clear the recently created league since we've used it
      if (recentlyCreatedLeague) {
        clearRecentlyCreatedLeague();
      }

      // Navigate to league page if joining a league, otherwise go to my team
      if (currentLeague) {
        router.replace(`/leagues/${currentLeague.id}`);
      } else {
        router.replace('/my-team');
      }
    } catch (err) {
      // Error handled by store
    } finally {
      setIsCreatingRecommended(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Create Your Team</Text>
          <Text style={styles.description}>
            Build your fantasy F1 team and compete for glory
          </Text>

          {(error || validationError) && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error || validationError}</Text>
            </View>
          )}

          <Input
            label="Team Name"
            placeholder="Enter team name"
            value={teamName}
            onChangeText={setTeamName}
            maxLength={30}
            autoFocus
            testID="team-name-input"
          />

          {/* Quick Action - Auto Create at the top for easy access */}
          <Button
            title={dataLoading ? "Loading data..." : "⚡ Auto Create Optimized Team"}
            onPress={handleCreateRecommended}
            loading={isCreatingRecommended}
            disabled={(isLoading && !isCreatingRecommended) || dataLoading || !teamName.trim() || (teamMode === 'league' && !currentLeague)}
            fullWidth
            style={styles.quickActionButton}
            testID="auto-create-team-btn"
          />
          <Text style={styles.quickActionHint}>
            One tap to create a balanced team within budget
          </Text>

          {/* Team Mode Selector */}
          <Text style={styles.sectionLabel}>Team Type</Text>
          <View style={styles.modeSelector}>
            <TouchableOpacity
              testID="solo-mode-btn"
              style={[
                styles.modeOption,
                teamMode === 'solo' && styles.modeOptionSelected,
                teamMode === 'solo' && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => setTeamMode('solo')}
            >
              <Ionicons
                name="person"
                size={24}
                color={teamMode === 'solo' ? COLORS.white : COLORS.gray[600]}
              />
              <Text
                style={[
                  styles.modeOptionText,
                  teamMode === 'solo' && styles.modeOptionTextSelected,
                ]}
              >
                Solo
              </Text>
              <Text
                style={[
                  styles.modeOptionHint,
                  teamMode === 'solo' && styles.modeOptionHintSelected,
                ]}
              >
                Track your picks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeOption,
                teamMode === 'league' && styles.modeOptionSelected,
                teamMode === 'league' && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              onPress={() => setTeamMode('league')}
            >
              <Ionicons
                name="people"
                size={24}
                color={teamMode === 'league' ? COLORS.white : COLORS.gray[600]}
              />
              <Text
                style={[
                  styles.modeOptionText,
                  teamMode === 'league' && styles.modeOptionTextSelected,
                ]}
              >
                Join League
              </Text>
              <Text
                style={[
                  styles.modeOptionHint,
                  teamMode === 'league' && styles.modeOptionHintSelected,
                ]}
              >
                Compete with friends
              </Text>
            </TouchableOpacity>
          </View>

          {/* League info */}
          {teamMode === 'league' && autoLeague ? (
            <View style={[styles.preselectedLeagueBanner, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]}>
              <Ionicons name="trophy" size={24} color={theme.primary} />
              <View style={styles.preselectedLeagueInfo}>
                <Text style={styles.preselectedLeagueLabel}>Will join</Text>
                <Text style={[styles.preselectedLeagueName, { color: theme.primary }]}>{autoLeague.name}</Text>
              </View>
            </View>
          ) : teamMode === 'league' && !autoLeague && !inviteLeague ? (
            <View style={styles.inviteCodeSection}>
              <Text style={styles.inviteCodeLabel}>Enter a league invite code to join</Text>
              <View style={styles.inviteCodeRow}>
                <Input
                  placeholder="e.g. ABC123"
                  value={inviteCode}
                  onChangeText={(text: string) => {
                    setInviteCode(text.toUpperCase());
                    setInviteError(null);
                    setInviteLeague(null);
                  }}
                  maxLength={8}
                  autoCapitalize="characters"
                  containerStyle={styles.inviteCodeInput}
                />
                <Button
                  title={isLookingUp ? "..." : "Join"}
                  onPress={handleLookupInviteCode}
                  disabled={!inviteCode.trim() || isLookingUp}
                  style={styles.inviteCodeButton}
                />
              </View>
              {inviteError && (
                <Text style={styles.inviteErrorText}>{inviteError}</Text>
              )}
              <Text style={styles.inviteCodeHint}>
                Don't have a code? Create a solo team or go to the Leagues tab to create your own league.
              </Text>
            </View>
          ) : teamMode === 'league' && inviteLeague ? (
            <View style={[styles.preselectedLeagueBanner, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '40' }]}>
              <Ionicons name="trophy" size={24} color={theme.primary} />
              <View style={styles.preselectedLeagueInfo}>
                <Text style={styles.preselectedLeagueLabel}>Will join</Text>
                <Text style={[styles.preselectedLeagueName, { color: theme.primary }]}>{inviteLeague.name}</Text>
              </View>
              <TouchableOpacity onPress={() => { setInviteLeague(null); setInviteCode(''); }}>
                <Ionicons name="close-circle" size={24} color={COLORS.text.muted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.modeDescription, { backgroundColor: theme.primary + '15' }]}>
              <Ionicons name="information-circle" size={20} color={theme.primary} />
              <Text style={styles.modeDescriptionText}>
                Solo teams let you track your fantasy picks without competing. You can join a league later.
              </Text>
            </View>
          )}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Team Rules</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Starting Dollars:</Text>
              <Text style={styles.infoValue}>${BUDGET}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Drivers:</Text>
              <Text style={styles.infoValue}>{TEAM_SIZE} drivers</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Constructor:</Text>
              <Text style={styles.infoValue}>1 constructor</Text>
            </View>
          </View>

          <Button
            title="Create Empty Team"
            onPress={handleCreate}
            loading={isLoading && !isCreatingRecommended}
            disabled={isCreatingRecommended || (teamMode === 'league' && !currentLeague)}
            variant="outline"
            fullWidth
            style={styles.button}
            testID="create-empty-team-btn"
          />
          <Text style={styles.recommendedHint}>
            Create an empty team and add drivers manually
          </Text>

          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="ghost"
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  keyboardView: {
    flex: 1,
  },

  content: {
    padding: SPACING.xl,
  },

  title: {
    fontSize: FONTS.sizes.xxl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
  },

  description: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    marginBottom: SPACING.xl,
  },

  errorContainer: {
    backgroundColor: COLORS.errorLight,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },

  errorText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.sm,
  },

  preselectedLeagueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '15',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },

  preselectedLeagueInfo: {
    flex: 1,
  },

  preselectedLeagueLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.secondary,
  },

  preselectedLeagueName: {
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.primary,
  },

  sectionLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },

  modeSelector: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },

  modeOption: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    alignItems: 'center',
  },

  modeOptionSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  modeOptionText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginTop: SPACING.xs,
  },

  modeOptionTextSelected: {
    color: COLORS.text.inverse,
  },

  modeOptionHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: SPACING.xs,
  },

  modeOptionHintSelected: {
    color: COLORS.text.inverse + 'CC',
  },

  modeDescription: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.primary + '15',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },

  modeDescriptionText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },

  infoBox: {
    backgroundColor: COLORS.card,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  infoTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
  },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },

  infoLabel: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
  },

  infoValue: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  button: {
    marginBottom: SPACING.md,
  },

  quickActionButton: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.success,
  },

  quickActionHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },

  recommendedHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    fontStyle: 'italic',
  },

  inviteCodeSection: {
    backgroundColor: COLORS.card,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  inviteCodeLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.sm,
  },

  inviteCodeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-start',
  },

  inviteCodeInput: {
    flex: 1,
  },

  inviteCodeButton: {
    marginTop: 0,
    minWidth: 70,
  },

  inviteErrorText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.error,
    marginTop: SPACING.xs,
  },

  inviteCodeHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: SPACING.sm,
    lineHeight: 18,
  },

});
