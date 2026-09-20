import React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';

export interface RaceSelectOption { key: string; label: string }

// LEAGUE tab selector (F-062): SEASON, LAST RACE, then every completed race.
export function GridRaceSelectSheet({ options, value, onPick, onClose }: {
  options: RaceSelectOption[];
  value: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const { colors, spacing, scaled } = useSimpleTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' }} onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}} accessible={false} accessibilityLabel="Choose what the standings show" style={{ maxHeight: '70%', backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: 10 }}>
            <MonoLabel>SHOW POINTS FOR</MonoLabel>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close"><MonoLabel color={colors.text.muted}>CLOSE</MonoLabel></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 16 }} showsVerticalScrollIndicator={false}>
            {options.map((o) => {
              const on = o.key === value;
              return (
                <Pressable
                  key={o.key}
                  onPress={() => onPick(o.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={o.label}
                  style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: scaled(16), borderBottomWidth: 1, borderBottomColor: colors.borderLight, opacity: pressed ? 0.7 : 1 })}
                >
                  <MonoLabel size={12} color={on ? colors.primary : colors.text.primary}>{o.label}</MonoLabel>
                  {on ? <MonoLabel size={12} color={colors.primary}>●</MonoLabel> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
