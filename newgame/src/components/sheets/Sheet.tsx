// Bottom-sheet primitive — Modal-based with a slide-up animation.
// Used by InsuranceSheet, BetSheet, MarkSentSheet, SpendSheet.

import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  scroll?: boolean;
}

export function Sheet({ visible, onClose, title, subtitle, children, scroll = true }: Props) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: t.surface, borderTopColor: t.line }]}>
          <View style={[styles.handle, { backgroundColor: t.line }]} />
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: t.fDisp, fontWeight: '600', fontSize: 18, letterSpacing: -0.4, color: t.text }}>{title}</Text>
              {subtitle ? (
                <Text style={{ marginTop: 4, fontFamily: t.fSans, fontSize: 11, color: t.textDim, lineHeight: 16 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                {
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: t.surface2,
                  borderWidth: 1,
                  borderColor: t.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ color: t.textDim, fontSize: 14, fontWeight: '700' }}>×</Text>
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 8 }}>{children}</ScrollView>
          ) : (
            <View style={{ paddingTop: 12 }}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 28,
    maxHeight: '90%',
  },
  handle: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginTop: 4 },
});
