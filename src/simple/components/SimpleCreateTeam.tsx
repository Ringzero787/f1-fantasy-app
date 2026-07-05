import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { S_RADIUS, S_FONT_FAMILY } from '../theme/simpleTheme';
import { useSimpleTheme } from '../hooks/useSimpleTheme';

interface Props {
  onCreate: (name: string, joinCode?: string) => Promise<void>;
  isSecondTeam?: boolean;
  onCancel?: () => void;
}

export const SimpleCreateTeam = React.memo(function SimpleCreateTeam({ onCreate, isSecondTeam, onCancel }: Props) {
  const { colors, fonts, spacing, scaled, displayUpright } = useSimpleTheme();
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

  const styles = useMemo(() => ({
    container: {
      flex: 1,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
      paddingHorizontal: spacing.xl,
      paddingTop: 60,
    },
    backBtn: {
      position: 'absolute' as const,
      top: spacing.sm,
      left: spacing.xl,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.xs,
      padding: spacing.sm,
      zIndex: 10,
    },
    backText: {
      fontSize: fonts.md,
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.primary,
    },
    iconWrap: {
      width: scaled(88),
      height: scaled(88),
      borderRadius: S_RADIUS.full,
      backgroundColor: colors.primaryFaint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      marginBottom: scaled(22),
    },
    title: {
      ...displayUpright,
      fontSize: scaled(28),
      letterSpacing: -0.6,
      color: colors.text.primary,
      textAlign: 'center' as const,
      marginBottom: spacing.sm,
    },
    subtitle: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.secondary,
      marginBottom: scaled(28),
      textAlign: 'center' as const,
    },
    input: {
      width: '100%' as any,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: S_RADIUS.lg,
      paddingHorizontal: scaled(16),
      paddingVertical: scaled(14),
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    codeInput: {
      width: '60%' as any,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: S_RADIUS.lg,
      paddingHorizontal: scaled(14),
      paddingVertical: scaled(11),
      fontSize: scaled(14),
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.text.primary,
      marginBottom: spacing.md,
      letterSpacing: 1.5,
    },
    error: {
      fontSize: fonts.sm,
      fontFamily: S_FONT_FAMILY.body.regular,
      color: colors.negative,
      marginBottom: spacing.md,
    },
    button: {
      width: '100%' as any,
      backgroundColor: colors.primary,
      borderRadius: S_RADIUS.lg,
      paddingVertical: scaled(15),
      alignItems: 'center' as const,
    },
    buttonDisabled: {
      backgroundColor: colors.primaryFaint,
      opacity: 0.6,
    },
    buttonText: {
      fontSize: scaled(15.5),
      fontFamily: S_FONT_FAMILY.body.semibold,
      letterSpacing: 0.2,
      color: colors.text.inverse,
    },
    cancelBtn: {
      marginTop: spacing.md,
      paddingVertical: spacing.sm,
    },
    cancelText: {
      fontSize: scaled(15),
      fontFamily: S_FONT_FAMILY.body.medium,
      color: colors.text.secondary,
    },
  }), [colors, fonts, spacing, scaled, displayUpright]);

  return (
    <View style={styles.container}>
      {isSecondTeam && onCancel && (
        <TouchableOpacity style={styles.backBtn} onPress={onCancel} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.primary} />
          <Text style={styles.backText}>Back to Team 1</Text>
        </TouchableOpacity>
      )}
      <View style={styles.iconWrap}>
        <Ionicons name={isSecondTeam ? 'add-circle-outline' : 'flag-outline'} size={scaled(44)} color={colors.primary} />
      </View>
      <Text style={styles.title}>{isSecondTeam ? 'Create Team 2' : 'Create your team'}</Text>
      <Text style={styles.subtitle}>
        {isSecondTeam ? 'Add a second team for another league' : 'Pick a name to get started'}
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Team name"
        placeholderTextColor={colors.text.muted}
        value={name}
        onChangeText={setName}
        maxLength={30}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <TextInput
        style={styles.codeInput}
        placeholder="Invite code (optional)"
        placeholderTextColor={colors.text.muted}
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
          <ActivityIndicator color={colors.text.inverse} size="small" />
        ) : (
          <Text style={[styles.buttonText, !valid && { color: colors.primary }]}>Create Team</Text>
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
