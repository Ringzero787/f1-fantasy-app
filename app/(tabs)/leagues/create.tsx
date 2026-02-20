import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../src/hooks/useAuth';
import { useLeagueStore } from '../../../src/store/league.store';
import { useTeamStore } from '../../../src/store/team.store';
import { usePurchaseStore } from '../../../src/store/purchase.store';
import { useAuthStore } from '../../../src/store/auth.store';
import { Input, Button, Avatar, PurchaseModal } from '../../../src/components';
import { COLORS, SPACING, FONTS, BORDER_RADIUS, FREE_LEAGUE_MEMBER_LIMIT } from '../../../src/config/constants';
import { useTheme } from '../../../src/hooks/useTheme';
import { PRODUCTS, PRODUCT_IDS } from '../../../src/config/products';
import { validateLeagueName } from '../../../src/utils/validation';
import type { FantasyTeam, League } from '../../../src/types';

const CURRENT_SEASON_ID = '2026';

export default function CreateLeagueScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { createLeague, isLoading, error, clearRecentlyCreatedLeague, clearError } = useLeagueStore();
  const { createTeam, userTeams, loadUserTeams, assignTeamToLeague } = useTeamStore();

  // Purchase store
  const hasExpansionCredit = usePurchaseStore(s => s.hasExpansionCredit);
  const consumeExpansionCredit = usePurchaseStore(s => s.consumeExpansionCredit);
  const purchaseLeagueExpansion = usePurchaseStore(s => s.purchaseLeagueExpansion);
  const purchaseLeagueSlot = usePurchaseStore(s => s.purchaseLeagueSlot);
  const hasLeagueSlotCredit = usePurchaseStore(s => s.hasLeagueSlotCredit);
  const consumeLeagueSlotCredit = usePurchaseStore(s => s.consumeLeagueSlotCredit);
  const isPurchasing = usePurchaseStore(s => s.isPurchasing);

  // Count leagues owned by this user
  const leagues = useLeagueStore(s => s.leagues);
  const ownedLeagueCount = user ? leagues.filter(l => l.ownerId === user.id).length : 0;

  // Find solo teams (teams not assigned to any league)
  const soloTeams = userTeams.filter(team => !team.leagueId);

  // Load user teams on mount and clear any previous errors
  useEffect(() => {
    clearError();
    if (user) {
      loadUserTeams(user.id);
    }
  }, [user]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [requireApproval, setRequireApproval] = useState(true);
  const [maxMembers, setMaxMembers] = useState(String(FREE_LEAGUE_MEMBER_LIMIT));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showExpansionPurchase, setShowExpansionPurchase] = useState(false);
  const [showLeagueSlotPurchase, setShowLeagueSlotPurchase] = useState(false);
  const hasCredit = hasExpansionCredit();
  const isDemoMode = useAuthStore.getState().isDemoMode;

  // Team selection modal state
  const [showTeamSelectModal, setShowTeamSelectModal] = useState(false);
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);
  const [isAssigningTeam, setIsAssigningTeam] = useState(false);
  const [modalSoloTeams, setModalSoloTeams] = useState<FantasyTeam[]>([]);

  const handleCreate = async () => {
    setValidationError(null);

    const validation = validateLeagueName(name);
    if (!validation.isValid) {
      setValidationError(validation.error!);
      return;
    }

    const members = parseInt(maxMembers, 10);
    if (isNaN(members) || members < 2 || members > 100) {
      setValidationError('Max members must be between 2 and 100');
      return;
    }

    if (!user) {
      setValidationError('You must be logged in to create a league');
      return;
    }

    // Gate second+ league behind league slot purchase
    const needsSlot = ownedLeagueCount >= 1;
    if (needsSlot && !isDemoMode && !hasLeagueSlotCredit()) {
      setShowLeagueSlotPurchase(true);
      return;
    }

    // Consume league slot credit if needed
    if (needsSlot && !isDemoMode) {
      consumeLeagueSlotCredit();
    }

    // Gate leagues >22 members behind expansion purchase
    const needsExpansion = members > FREE_LEAGUE_MEMBER_LIMIT;

    if (needsExpansion && !isDemoMode && !hasExpansionCredit()) {
      setShowExpansionPurchase(true);
      return;
    }

    // Consume expansion credit if needed
    if (needsExpansion && !isDemoMode) {
      consumeExpansionCredit();
    }

    setIsCreating(true);
    try {
      // Create the league
      const league = await createLeague(
        user.id,
        user.displayName,
        {
          name: name.trim(),
          description: description.trim() || undefined,
          isPublic,
          maxMembers: members,
          requireApproval,
        },
        CURRENT_SEASON_ID
      );

      if (league && league.id) {
        // Clear the recently created league flag
        clearRecentlyCreatedLeague();

        // Get fresh teams from store to check for solo teams
        const freshTeams = useTeamStore.getState().userTeams;
        const freshSoloTeams = freshTeams.filter(team => !team.leagueId);

        // Check if user has existing solo teams
        if (freshSoloTeams.length > 0) {
          // Store the created league and solo teams, then show team selection modal
          setCreatedLeague(league);
          setModalSoloTeams(freshSoloTeams);
          setShowTeamSelectModal(true);
          setIsCreating(false);
        } else {
          // No existing solo team - auto-create a new team
          const teamName = `${user.displayName}'s Team`;
          await createTeam(user.id, league.id, teamName);

          // Show confirmation and navigate to the league page
          Alert.alert(
            'League Created!',
            `Your league "${league.name}" is ready! A new team has been created and added to your league. Head to the My Team tab to build your lineup.`,
            [
              {
                text: 'Got it',
                onPress: () => router.replace(`/leagues/${league.id}`),
              },
            ]
          );
        }
      } else {
        setValidationError('Failed to create league - no league ID returned');
        setIsCreating(false);
      }
    } catch (err) {
      // Error is set in the store, but also set local error as fallback
      const message = err instanceof Error ? err.message : 'Failed to create league';
      setValidationError(message);
      setIsCreating(false);
    }
  };

  // Handle selecting an existing team for the league
  const handleSelectTeam = async (team: FantasyTeam) => {
    if (!createdLeague) return;

    setIsAssigningTeam(true);
    try {
      await assignTeamToLeague(team.id, createdLeague.id);
      setShowTeamSelectModal(false);
      Alert.alert(
        'Team Added!',
        `Your team "${team.name}" has been added to the league.`,
        [{ text: 'Got it', onPress: () => router.replace(`/leagues/${createdLeague.id}`) }]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to assign team to league');
    } finally {
      setIsAssigningTeam(false);
    }
  };

  // Handle creating a new team for the league
  const handleCreateNewTeam = async () => {
    if (!createdLeague || !user) return;

    setIsAssigningTeam(true);
    try {
      const teamName = `${user.displayName}'s Team`;
      await createTeam(user.id, createdLeague.id, teamName);
      setShowTeamSelectModal(false);
      Alert.alert(
        'Team Created!',
        'A new team has been created for this league. Head to My Team to build your lineup.',
        [{ text: 'Got it', onPress: () => router.replace(`/leagues/${createdLeague.id}`) }]
      );
    } catch (err) {
      Alert.alert('Error', 'Failed to create team');
    } finally {
      setIsAssigningTeam(false);
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
          <Text style={styles.title}>Create a League</Text>
          <Text style={styles.description}>
            Set up your own fantasy league and invite friends to compete
          </Text>

          {(error || validationError) && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error || validationError}</Text>
            </View>
          )}

          <Input
            label="League Name"
            placeholder="Enter league name"
            value={name}
            onChangeText={setName}
            maxLength={50}
          />

          <Input
            label="Description (Optional)"
            placeholder="What's your league about?"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            maxLength={200}
          />

          <Text style={styles.inputLabel}>Max Members</Text>
          <View style={styles.memberRow}>
            <View style={styles.lockedField}>
              <Text style={styles.lockedFieldText}>
                {hasCredit || isDemoMode ? maxMembers : String(FREE_LEAGUE_MEMBER_LIMIT)}
              </Text>
              {!(hasCredit || isDemoMode) && (
                <Ionicons name="lock-closed" size={14} color={COLORS.text.muted} />
              )}
            </View>
            {hasCredit || isDemoMode ? (
              <View style={styles.expandedInputWrap}>
                <Input
                  placeholder="22-100"
                  value={maxMembers}
                  onChangeText={(val) => {
                    const num = parseInt(val, 10);
                    if (val === '' || (!isNaN(num) && num <= 100)) {
                      setMaxMembers(val);
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.expandedHint}>Expansion unlocked (up to 100)</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.buyMoreButton, { backgroundColor: theme.primary + '15', borderColor: theme.primary + '30' }]}
                onPress={() => setShowExpansionPurchase(true)}
              >
                <Ionicons name="cart-outline" size={18} color={theme.primary} />
                <Text style={[styles.buyMoreText, { color: theme.primary }]}>Add 20 Slots — $4.99</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Public League</Text>
              <Text style={styles.switchDescription}>
                Anyone can find and join your league
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: COLORS.border.default, true: theme.primary + '60' }}
              thumbColor={isPublic ? theme.primary : COLORS.surface}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Require Approval</Text>
              <Text style={styles.switchDescription}>
                New members must be approved by an admin before joining
              </Text>
            </View>
            <Switch
              value={requireApproval}
              onValueChange={setRequireApproval}
              trackColor={{ false: COLORS.border.default, true: theme.primary + '60' }}
              thumbColor={requireApproval ? theme.primary : COLORS.surface}
            />
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>What happens next?</Text>
            <Text style={styles.infoText}>
              {soloTeams.length > 0
                ? `You have ${soloTeams.length} existing team${soloTeams.length > 1 ? 's' : ''} you can add to this league, or create a new one. Share your invite code with friends so they can join!`
                : 'A team will be created for you automatically. You can then build your team from the My Team tab. Share your invite code with friends so they can join your league!'}
            </Text>
          </View>

          {ownedLeagueCount >= 1 && !isDemoMode && !hasLeagueSlotCredit() && (
            <View style={styles.slotNotice}>
              <Ionicons name="information-circle-outline" size={18} color={COLORS.warning} />
              <Text style={styles.slotNoticeText}>
                Additional leagues require a one-time $2.99 purchase
              </Text>
            </View>
          )}

          <Button
            title="Create League"
            onPress={handleCreate}
            loading={isCreating || isLoading}
            fullWidth
            style={styles.button}
            testID="create-league-btn"
          />

          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="ghost"
            fullWidth
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Team Selection Modal */}
      <Modal
        visible={showTeamSelectModal}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="trophy" size={28} color={theme.primary} />
              <Text style={styles.modalTitle}>League Created!</Text>
            </View>

            <Text style={styles.modalSubtitle}>
              Select a team to join "{createdLeague?.name}"
            </Text>

            <ScrollView style={styles.teamList} showsVerticalScrollIndicator={false}>
              {modalSoloTeams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={styles.teamOption}
                  onPress={() => handleSelectTeam(team)}
                  disabled={isAssigningTeam}
                >
                  <Avatar
                    name={team.name}
                    size="medium"
                    variant="team"
                    imageUrl={team.avatarUrl}
                  />
                  <View style={styles.teamOptionInfo}>
                    <Text style={styles.teamOptionName}>{team.name}</Text>
                    <Text style={styles.teamOptionDetails}>
                      {team.drivers.length}/5 drivers • {team.totalPoints} pts
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.text.muted} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalDivider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.createNewTeamButton, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '30' }]}
              onPress={handleCreateNewTeam}
              disabled={isAssigningTeam}
            >
              <Ionicons name="add-circle-outline" size={24} color={theme.primary} />
              <Text style={[styles.createNewTeamText, { color: theme.primary }]}>Create New Team</Text>
            </TouchableOpacity>

            {isAssigningTeam && (
              <Text style={styles.assigningText}>Setting up your team...</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* League Expansion Purchase Modal */}
      <PurchaseModal
        visible={showExpansionPurchase}
        onClose={() => setShowExpansionPurchase(false)}
        onPurchase={async () => {
          await purchaseLeagueExpansion();
          // Modal stays open during purchase; closes when listener grants credit
          // or when user dismisses after error alert
        }}
        isLoading={isPurchasing}
        title={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].title}
        description={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].description}
        price={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].price}
        icon={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].icon}
        benefits={PRODUCTS[PRODUCT_IDS.LEAGUE_EXPANSION].benefits}
      />

      {/* League Slot Purchase Modal */}
      <PurchaseModal
        visible={showLeagueSlotPurchase}
        onClose={() => setShowLeagueSlotPurchase(false)}
        onPurchase={async () => {
          await purchaseLeagueSlot();
          // Modal stays open during purchase; closes when listener grants credit
          // or when user dismisses after error alert
        }}
        isLoading={isPurchasing}
        title={PRODUCTS[PRODUCT_IDS.LEAGUE_SLOT].title}
        description={PRODUCTS[PRODUCT_IDS.LEAGUE_SLOT].description}
        price={PRODUCTS[PRODUCT_IDS.LEAGUE_SLOT].price}
        icon={PRODUCTS[PRODUCT_IDS.LEAGUE_SLOT].icon}
        benefits={PRODUCTS[PRODUCT_IDS.LEAGUE_SLOT].benefits}
      />
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
    backgroundColor: COLORS.error + '15',
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },

  errorText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.sm,
  },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
  },

  switchInfo: {
    flex: 1,
    marginRight: SPACING.md,
  },

  switchLabel: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  switchDescription: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  infoBox: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.xl,
  },

  infoTitle: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
  },

  infoText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 20,
  },

  button: {
    marginBottom: SPACING.md,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },

  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },

  modalTitle: {
    fontSize: FONTS.sizes.xl,
    fontWeight: 'bold',
    color: COLORS.text.primary,
  },

  modalSubtitle: {
    fontSize: FONTS.sizes.md,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },

  teamList: {
    maxHeight: 250,
  },

  teamOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
  },

  teamOptionInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },

  teamOptionName: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  teamOptionDetails: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    marginTop: 2,
  },

  modalDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.md,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border.default,
  },

  dividerText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    paddingHorizontal: SPACING.md,
  },

  createNewTeamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },

  createNewTeamText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.primary,
  },

  assigningText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.muted,
    textAlign: 'center',
    marginTop: SPACING.md,
    fontStyle: 'italic',
  },

  inputLabel: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.text.secondary,
    marginBottom: SPACING.xs,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },

  lockedField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border.default,
    minWidth: 60,
    justifyContent: 'center',
  },

  lockedFieldText: {
    fontSize: FONTS.sizes.md,
    fontWeight: '600',
    color: COLORS.text.primary,
  },

  buyMoreButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary + '15',
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },

  buyMoreText: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
    color: COLORS.primary,
  },

  expandedInputWrap: {
    flex: 1,
  },

  expandedHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.success,
    marginTop: 2,
  },

  slotNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.warning + '15',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '30',
  },

  slotNoticeText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.warning,
    lineHeight: 18,
  },
});
