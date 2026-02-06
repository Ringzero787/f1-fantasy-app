import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useTeamStore } from '../../../src/store/team.store';
import { useLeagueStore } from '../../../src/store/league.store';
import { useDrivers, useConstructors } from '../../../src/hooks';
import { Input, Button } from '../../../src/components';
import { COLORS, SPACING, FONTS, BUDGET, TEAM_SIZE, BORDER_RADIUS } from '../../../src/config/constants';
import { validateTeamName } from '../../../src/utils/validation';
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
  const { user } = useAuth();
  const { leagues, loadUserLeagues, lookupLeagueByCode, recentlyCreatedLeague, clearRecentlyCreatedLeague } = useLeagueStore();
  const { createTeam, addDriver, setConstructor, userTeams, isLoading, error, currentTeam, setCurrentTeam } = useTeamStore();
  const { data: allDrivers, isLoading: driversLoading } = useDrivers();
  const { data: allConstructors, isLoading: constructorsLoading } = useConstructors();

  // Get URL params for pre-selected league (from league creation flow - legacy support)
  const { leagueId, leagueName } = useLocalSearchParams<{ leagueId?: string; leagueName?: string }>();
  const hasPreselectedLeague = !!leagueId;

  // Check if there's a recently created league to suggest
  const hasRecentLeague = !!recentlyCreatedLeague;

  const [teamName, setTeamName] = useState('');
  // Default to league mode if there's a recently created league or preselected league
  const [teamMode, setTeamMode] = useState<TeamMode>(hasPreselectedLeague || hasRecentLeague ? 'league' : 'solo');
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCreatingRecommended, setIsCreatingRecommended] = useState(false);

  // League code lookup
  const [leagueCode, setLeagueCode] = useState('');
  const [foundLeague, setFoundLeague] = useState<League | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Set up pre-selected league from URL params
  React.useEffect(() => {
    if (leagueId) {
      // First try to find the league in the store
      const existingLeague = leagues.find(l => l.id === leagueId);
      if (existingLeague) {
        setSelectedLeague(existingLeague);
        setTeamMode('league');
      } else if (leagueName) {
        // Create a minimal league object for the pre-selected league
        const preselectedLeague: League = {
          id: leagueId,
          name: decodeURIComponent(leagueName),
          ownerId: user?.id || '',
          ownerName: user?.displayName || '',
          inviteCode: '',
          isPublic: false,
          maxMembers: 20,
          memberCount: 1,
          seasonId: '2026',
          createdAt: new Date(),
          updatedAt: new Date(),
          settings: {
            allowLateJoin: true,
            lockDeadline: 'qualifying',
            scoringRules: {
              racePoints: [],
              sprintPoints: [],
              fastestLapBonus: 0,
              positionGainedBonus: 0,
              qualifyingPoints: [],
              dnfPenalty: 0,
              dsqPenalty: 0,
            },
          },
        };
        setSelectedLeague(preselectedLeague);
        setTeamMode('league');
      }
    }
  }, [leagueId, leagueName, user, leagues]);

  // Auto-select recently created league if available (and no URL param league)
  React.useEffect(() => {
    if (!hasPreselectedLeague && recentlyCreatedLeague && !selectedLeague) {
      setSelectedLeague(recentlyCreatedLeague);
      setTeamMode('league');
    }
  }, [recentlyCreatedLeague, hasPreselectedLeague, selectedLeague]);

  // Load user leagues when component mounts
  React.useEffect(() => {
    if (user) {
      loadUserLeagues(user.id);
    }
  }, [user]);

  const dataLoading = driversLoading || constructorsLoading;

  // Handle league code lookup
  const handleLookupCode = async () => {
    if (!leagueCode.trim()) return;

    setIsLookingUp(true);
    setLookupError(null);

    try {
      const league = await lookupLeagueByCode(leagueCode.trim());
      if (league) {
        setFoundLeague(league);
        setSelectedLeague(league);
        setLookupError(null);
      } else {
        setFoundLeague(null);
        setLookupError('No league found with that code');
      }
    } catch (err) {
      setLookupError('Failed to lookup league');
      setFoundLeague(null);
    } finally {
      setIsLookingUp(false);
    }
  };

  // Get the current league based on mode
  const currentLeague = teamMode === 'league' ? selectedLeague : null;

  // Check if user already has a team in the selected league
  const existingTeamInLeague = currentLeague
    ? userTeams.find(t => t.leagueId === currentLeague.id)
    : null;

  const handleCreate = async () => {
    setValidationError(null);

    const validation = validateTeamName(teamName);
    if (!validation.isValid) {
      setValidationError(validation.error!);
      return;
    }

    if (!user) return;

    if (teamMode === 'league' && !selectedLeague) {
      setValidationError('Please select a league to join');
      return;
    }

    // Check if user already has a team in this league
    if (existingTeamInLeague) {
      setValidationError(`You already have a team "${existingTeamInLeague.name}" in this league. Only one team per league is allowed.`);
      return;
    }

    try {
      // Support solo teams (null leagueId) or league teams
      await createTeam(user.id, currentLeague?.id || null, teamName.trim());

      // Clear the recently created league since we've used it
      if (recentlyCreatedLeague) {
        clearRecentlyCreatedLeague();
      }

      // Navigate to My Team tab where they can add drivers and constructors
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

    if (teamMode === 'league' && !selectedLeague) {
      setValidationError('Please select a league to join');
      return;
    }

    // Check if user already has a team in this league
    if (existingTeamInLeague) {
      setValidationError(`You already have a team "${existingTeamInLeague.name}" in this league. Only one team per league is allowed.`);
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
      // Create the team first (support solo teams with null leagueId)
      await createTeam(user.id, currentLeague?.id || null, teamName.trim());

      // Build team atomically - convert Driver[] to FantasyDriver[]
      const totalCost = recommended.drivers.reduce((sum, d) => sum + d.price, 0) + recommended.constructor.price;

      const fantasyDrivers = recommended.drivers.map(driver => ({
        driverId: driver.id,
        name: driver.name,
        shortName: driver.shortName || driver.name.substring(0, 3).toUpperCase(),
        purchasePrice: driver.price,
        currentPrice: driver.price,
        pointsScored: 0,
      }));

      const fantasyConstructor = {
        constructorId: recommended.constructor.id,
        name: recommended.constructor.name,
        shortName: recommended.constructor.shortName || recommended.constructor.name.substring(0, 3).toUpperCase(),
        purchasePrice: recommended.constructor.price,
        currentPrice: recommended.constructor.price,
        pointsScored: 0,
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
            {hasPreselectedLeague
              ? 'Set up your team to compete in your new league'
              : 'Build your fantasy F1 team and compete for glory'}
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
          />

          {/* Quick Action - Auto Create at the top for easy access */}
          <Button
            title={dataLoading ? "Loading data..." : "⚡ Auto Create Optimized Team"}
            onPress={handleCreateRecommended}
            loading={isCreatingRecommended}
            disabled={(isLoading && !isCreatingRecommended) || dataLoading || !teamName.trim()}
            fullWidth
            style={styles.quickActionButton}
          />
          <Text style={styles.quickActionHint}>
            One tap to create a balanced team within budget
          </Text>

          {/* Pre-selected League Banner (from league creation flow) */}
          {hasPreselectedLeague && selectedLeague && (
            <View style={styles.preselectedLeagueBanner}>
              <Ionicons name="trophy" size={24} color={COLORS.primary} />
              <View style={styles.preselectedLeagueInfo}>
                <Text style={styles.preselectedLeagueLabel}>Creating team for</Text>
                <Text style={styles.preselectedLeagueName}>{selectedLeague.name}</Text>
              </View>
            </View>
          )}

          {/* Team Mode Selector - only show if no pre-selected league */}
          {!hasPreselectedLeague && (
            <>
              <Text style={styles.sectionLabel}>Team Type</Text>
              <View style={styles.modeSelector}>
                <TouchableOpacity
                  style={[
                    styles.modeOption,
                    teamMode === 'solo' && styles.modeOptionSelected,
                  ]}
                  onPress={() => {
                    setTeamMode('solo');
                    setSelectedLeague(null);
                  }}
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
            </>
          )}

          {/* League Selection (only show when league mode is selected and no pre-selected league) */}
          {teamMode === 'league' && !hasPreselectedLeague && (
            <View style={styles.leagueSection}>
              {/* Recently Created League Banner */}
              {recentlyCreatedLeague && (
                <View style={styles.recentLeagueBanner}>
                  <View style={styles.recentLeagueHeader}>
                    <Ionicons name="sparkles" size={20} color={COLORS.primary} />
                    <Text style={styles.recentLeagueTitle}>Your New League</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.recentLeagueCard,
                      selectedLeague?.id === recentlyCreatedLeague.id && styles.recentLeagueCardSelected,
                    ]}
                    onPress={() => setSelectedLeague(recentlyCreatedLeague)}
                  >
                    <View style={styles.recentLeagueContent}>
                      <View style={styles.recentLeagueIcon}>
                        <Ionicons name="trophy" size={24} color={COLORS.primary} />
                      </View>
                      <View style={styles.recentLeagueInfo}>
                        <Text style={[
                          styles.recentLeagueName,
                          selectedLeague?.id === recentlyCreatedLeague.id && styles.recentLeagueNameSelected,
                        ]}>
                          {recentlyCreatedLeague.name}
                        </Text>
                        <Text style={[
                          styles.recentLeagueCode,
                          selectedLeague?.id === recentlyCreatedLeague.id && styles.recentLeagueCodeSelected,
                        ]}>
                          Code: {recentlyCreatedLeague.inviteCode}
                        </Text>
                      </View>
                    </View>
                    {selectedLeague?.id === recentlyCreatedLeague.id && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Divider if there's a recent league */}
              {recentlyCreatedLeague && (
                <View style={styles.dividerContainer}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>or join another league</Text>
                  <View style={styles.divider} />
                </View>
              )}

              {/* League Code Input */}
              <Text style={styles.sectionLabel}>Enter League Code</Text>
              <View style={styles.codeInputRow}>
                <View style={styles.codeInputWrapper}>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="e.g. ABC123"
                    placeholderTextColor={COLORS.gray[400]}
                    value={leagueCode}
                    onChangeText={(text) => {
                      setLeagueCode(text.toUpperCase());
                      setLookupError(null);
                    }}
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                </View>
                <TouchableOpacity
                  style={[
                    styles.lookupButton,
                    (!leagueCode.trim() || isLookingUp) && styles.lookupButtonDisabled,
                  ]}
                  onPress={handleLookupCode}
                  disabled={!leagueCode.trim() || isLookingUp}
                >
                  {isLookingUp ? (
                    <Text style={styles.lookupButtonText}>...</Text>
                  ) : (
                    <Ionicons name="search" size={20} color={COLORS.white} />
                  )}
                </TouchableOpacity>
              </View>

              {lookupError && (
                <Text style={styles.lookupError}>{lookupError}</Text>
              )}

              {/* Found League from Code */}
              {foundLeague && (
                <View style={styles.foundLeagueContainer}>
                  <TouchableOpacity
                    style={[
                      styles.foundLeagueCard,
                      selectedLeague?.id === foundLeague.id && styles.leagueCardSelected,
                    ]}
                    onPress={() => setSelectedLeague(foundLeague)}
                  >
                    <View style={styles.foundLeagueContent}>
                      <View style={[styles.leagueCardIcon, { backgroundColor: COLORS.success + '20' }]}>
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={selectedLeague?.id === foundLeague.id ? COLORS.white : COLORS.success}
                        />
                      </View>
                      <View style={styles.foundLeagueInfo}>
                        <Text
                          style={[
                            styles.foundLeagueName,
                            selectedLeague?.id === foundLeague.id && styles.leagueCardNameSelected,
                          ]}
                        >
                          {foundLeague.name}
                        </Text>
                        <Text
                          style={[
                            styles.foundLeagueDetails,
                            selectedLeague?.id === foundLeague.id && styles.leagueCardMembersSelected,
                          ]}
                        >
                          {foundLeague.memberCount || 0} members • Code: {foundLeague.inviteCode}
                        </Text>
                      </View>
                    </View>
                    {selectedLeague?.id === foundLeague.id && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Divider if user has leagues */}
              {leagues.length > 0 && (
                <View style={styles.dividerContainer}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>or select from your leagues</Text>
                  <View style={styles.divider} />
                </View>
              )}

              {/* User's Existing Leagues */}
              {leagues.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.leagueList}
                >
                  {leagues.map((league) => (
                    <TouchableOpacity
                      key={league.id}
                      style={[
                        styles.leagueCard,
                        selectedLeague?.id === league.id && styles.leagueCardSelected,
                      ]}
                      onPress={() => setSelectedLeague(league)}
                    >
                      <View style={styles.leagueCardIcon}>
                        <Ionicons
                          name="trophy"
                          size={20}
                          color={selectedLeague?.id === league.id ? COLORS.white : COLORS.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.leagueCardName,
                          selectedLeague?.id === league.id && styles.leagueCardNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {league.name}
                      </Text>
                      <Text
                        style={[
                          styles.leagueCardMembers,
                          selectedLeague?.id === league.id && styles.leagueCardMembersSelected,
                        ]}
                      >
                        {league.memberCount || 0} members
                      </Text>
                      {selectedLeague?.id === league.id && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color={COLORS.white}
                          style={styles.leagueCardCheck}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Browse Leagues Button */}
              <TouchableOpacity
                style={styles.browseLeaguesButton}
                onPress={() => router.push('/leagues')}
              >
                <Ionicons name="globe-outline" size={18} color={COLORS.primary} />
                <Text style={styles.browseLeaguesText}>Browse Public Leagues</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Warning if user already has a team in the selected league */}
          {existingTeamInLeague && (
            <View style={styles.warningBox}>
              <Ionicons name="warning" size={20} color={COLORS.warning} />
              <View style={styles.warningContent}>
                <Text style={styles.warningTitle}>Already in this league</Text>
                <Text style={styles.warningText}>
                  You already have a team "{existingTeamInLeague.name}" in this league. Only one team per league is allowed.
                </Text>
              </View>
            </View>
          )}

          {/* Mode description */}
          {!existingTeamInLeague && (
            <View style={styles.modeDescription}>
              <Ionicons
                name={teamMode === 'solo' ? 'information-circle' : 'trophy'}
                size={20}
                color={COLORS.primary}
              />
              <Text style={styles.modeDescriptionText}>
                {teamMode === 'solo'
                  ? 'Solo teams let you track your fantasy picks without competing. You can join a league later.'
                  : selectedLeague
                  ? `You'll be competing in ${selectedLeague.name}`
                  : 'Select a league above to compete with other players'}
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
            disabled={isCreatingRecommended}
            variant="outline"
            fullWidth
            style={styles.button}
          />
          <Text style={styles.recommendedHint}>
            Create an empty team and add drivers manually
          </Text>

          <Button
            title={hasPreselectedLeague ? "Skip Team Creation" : "Cancel"}
            onPress={() => {
              if (hasPreselectedLeague && leagueId) {
                // Go to the league page they just created
                router.replace(`/leagues/${leagueId}`);
              } else {
                router.back();
              }
            }}
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

  leagueSection: {
    marginBottom: SPACING.md,
  },

  recentLeagueBanner: {
    marginBottom: SPACING.md,
  },

  recentLeagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  recentLeagueTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  recentLeagueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary + '15',
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
  },

  recentLeagueCardSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  recentLeagueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  recentLeagueIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  recentLeagueInfo: {
    flex: 1,
  },

  recentLeagueName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  recentLeagueNameSelected: {
    color: COLORS.text.inverse,
  },

  recentLeagueCode: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  recentLeagueCodeSelected: {
    color: COLORS.text.inverse + 'CC',
  },

  codeInputRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },

  codeInputWrapper: {
    flex: 1,
  },

  codeInput: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: FONTS.sizes.lg,
    fontWeight: '600',
    color: COLORS.text.primary,
    backgroundColor: COLORS.card,
    letterSpacing: 2,
  },

  lookupButton: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  lookupButtonDisabled: {
    backgroundColor: COLORS.gray[700],
  },

  lookupButtonText: {
    color: COLORS.text.inverse,
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
  },

  lookupError: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.error,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.md,
  },

  foundLeagueContainer: {
    marginBottom: SPACING.md,
  },

  foundLeagueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.success,
  },

  foundLeagueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  foundLeagueInfo: {
    marginLeft: SPACING.md,
    flex: 1,
  },

  foundLeagueName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  foundLeagueDetails: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    marginTop: 2,
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.md,
  },

  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border.default,
  },

  dividerText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    paddingHorizontal: SPACING.md,
  },

  browseLeaguesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },

  browseLeaguesText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontWeight: '500',
  },

  leagueList: {
    marginHorizontal: -SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },

  leagueCard: {
    width: 140,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    marginRight: SPACING.sm,
    alignItems: 'center',
  },

  leagueCardSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  leagueCardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },

  leagueCardName: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.primary,
    textAlign: 'center',
  },

  leagueCardNameSelected: {
    color: COLORS.text.inverse,
  },

  leagueCardMembers: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.text.muted,
    marginTop: SPACING.xs,
  },

  leagueCardMembersSelected: {
    color: COLORS.text.inverse + 'CC',
  },

  leagueCardCheck: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
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

  hintText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginBottom: SPACING.xl,
    lineHeight: 20,
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

  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warningLight,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },

  warningContent: {
    flex: 1,
  },

  warningTitle: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.warning,
    marginBottom: SPACING.xs,
  },

  warningText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },
});
