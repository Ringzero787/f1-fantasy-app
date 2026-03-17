import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_COLORS, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';

interface Props {
  onCreate: (name: string, joinCode?: string) => Promise<void>;
  isSecondTeam?: boolean;
  onCancel?: () => void;
}

export const SimpleCreateTeam = React.memo(function SimpleCreateTeam({ onCreate, isSecondTeam, onCancel }: Props) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length >= 2;

  const handleCreate = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate(name.trim(), joinCode.trim() || undefined);
    } catch (e: any) {
      setError(e.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {isSecondTeam && onCancel && (
        <TouchableOpacity style={styles.backBtn} onPress={onCancel} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={S_COLORS.primary} />
          <Text style={styles.backText}>Back to Team 1</Text>
        </TouchableOpacity>
      )}
      <View style={styles.iconWrap}>
        <Ionicons name={isSecondTeam ? 'add-circle-outline' : 'flag-outline'} size={48} color={S_COLORS.primaryLight} />
      </View>
      <Text style={styles.title}>{isSecondTeam ? 'Create Team 2' : 'Create Your Team'}</Text>
      <Text style={styles.subtitle}>
        {isSecondTeam ? 'Add a second team for another league' : 'Pick a name to get started'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Team name"
        placeholderTextColor={S_COLORS.text.muted}
        value={name}
        onChangeText={setName}
        maxLength={30}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <TextInput
        style={styles.codeInput}
        placeholder="Invite code (optional)"
        placeholderTextColor={S_COLORS.text.muted}
        value={joinCode}
        onChangeText={setJoinCode}
        maxLength={20}
        autoCapitalize="characters"
        returnKeyType="done"
        onSubmitEditing={handleCreate}
        textAlign="center"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, !valid && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={!valid || loading}
        activeOpacity={0.7}
      >
        {loading ? (
          <ActivityIndicator color={S_COLORS.text.inverse} size="small" />
        ) : (
          <Text style={styles.buttonText}>Create Team</Text>
        )}
      </TouchableOpacity>

      {isSecondTeam && onCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: S_SPACING.xl,
    paddingTop: 60,
  },
  backBtn: {
    position: 'absolute',
    top: S_SPACING.sm,
    left: S_SPACING.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S_SPACING.xs,
    padding: S_SPACING.sm,
    zIndex: 10,
  },
  backText: {
    fontSize: S_FONTS.sizes.md,
    fontWeight: S_FONTS.weights.medium,
    color: S_COLORS.primary,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: S_COLORS.primaryFaint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S_SPACING.lg,
  },
  title: {
    fontSize: S_FONTS.sizes.xxl,
    fontWeight: S_FONTS.weights.bold,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.xs,
  },
  subtitle: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.muted,
    marginBottom: S_SPACING.xl,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: S_COLORS.surface,
    borderWidth: 1,
    borderColor: S_COLORS.border,
    borderRadius: S_RADIUS.md,
    paddingHorizontal: S_SPACING.lg,
    paddingVertical: S_SPACING.md + 2,
    fontSize: S_FONTS.sizes.lg,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.md,
  },
  codeInput: {
    width: '60%',
    backgroundColor: S_COLORS.surface,
    borderWidth: 1,
    borderColor: S_COLORS.border,
    borderRadius: S_RADIUS.md,
    paddingHorizontal: S_SPACING.md,
    paddingVertical: S_SPACING.sm + 2,
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.primary,
    marginBottom: S_SPACING.md,
    letterSpacing: 1.5,
  },
  error: {
    fontSize: S_FONTS.sizes.sm,
    color: S_COLORS.negative,
    marginBottom: S_SPACING.md,
  },
  button: {
    width: '100%',
    backgroundColor: S_COLORS.primary,
    borderRadius: S_RADIUS.md,
    paddingVertical: S_SPACING.md + 2,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: S_FONTS.sizes.lg,
    fontWeight: S_FONTS.weights.semibold,
    color: S_COLORS.text.inverse,
  },
  cancelBtn: {
    marginTop: S_SPACING.md,
    paddingVertical: S_SPACING.sm,
  },
  cancelText: {
    fontSize: S_FONTS.sizes.md,
    color: S_COLORS.text.muted,
    fontWeight: S_FONTS.weights.medium,
  },
});
