import React from 'react';
import { View, Text, Pressable, Linking, type StyleProp, type ViewStyle } from 'react-native';
import { useSimpleTheme } from '../hooks/useSimpleTheme';
import { MonoLabel } from './GridBits';
import { isNoticeUrl, type Notice } from './notice';

/**
 * F-174: the server notice at the top of the Team panel. `notice` is already parsed and checked
 * (noticeToShow in ./notice.ts); every string is rendered as plain text. The card wraps at any
 * display size and OS font scale: no line limits, and the dismiss control keeps its own column.
 */
export function GridNoticeBanner({ notice, onDismiss, style }: {
  notice: Notice;
  onDismiss: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, family, scaled } = useSimpleTheme();
  const accent = notice.tone === 'warn' ? colors.warning : colors.text.primary;
  const kicker = notice.tone === 'warn' ? 'HEADS UP' : 'NOTICE';
  const url = notice.url && isNoticeUrl(notice.url) ? notice.url : null;
  const openLink = async () => {
    if (!url) return;
    try { await Linking.openURL(url); } catch { /* nothing to do: the notice stays */ }
  };
  return (
    <View
      testID="grid-notice"
      style={[{ borderWidth: 1, borderColor: notice.tone === 'warn' ? colors.warning : colors.borderStrong, backgroundColor: colors.card, borderRadius: 14, paddingVertical: scaled(12), paddingLeft: scaled(14), paddingRight: scaled(6), gap: 6 }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View accessible accessibilityRole="summary" accessibilityLabel={`${notice.tone === 'warn' ? 'Heads up' : 'Notice'}: ${notice.title}. ${notice.body}`} style={{ flex: 1, minWidth: 0, gap: 6, paddingTop: 2 }}>
          <MonoLabel size={10} color={accent}>{kicker}</MonoLabel>
          <Text accessibilityRole="header" style={{ fontFamily: family.ui.black, fontSize: scaled(15), lineHeight: scaled(20), letterSpacing: scaled(15) * 0.01, color: colors.text.primary }}>
            {notice.title}
          </Text>
          <Text style={{ fontFamily: family.ui.regular, fontSize: scaled(13), lineHeight: scaled(19), color: colors.text.secondary }}>
            {notice.body}
          </Text>
        </View>
        <Pressable
          onPress={() => onDismiss(notice.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notice"
          accessibilityHint="Hides this notice on this device"
          style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          <Text style={{ fontFamily: family.mono.bold, fontSize: scaled(16), color: colors.text.muted }}>✕</Text>
        </Pressable>
      </View>
      {url ? (
        <Pressable
          onPress={openLink}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 14 }}
          accessibilityRole="link"
          accessibilityLabel={`More about ${notice.title}`}
          style={({ pressed }) => ({ alignSelf: 'flex-start', borderBottomWidth: 1, borderBottomColor: colors.primary, paddingBottom: 2, marginTop: 2, opacity: pressed ? 0.6 : 1 })}
        >
          <MonoLabel color={colors.primary}>MORE →</MonoLabel>
        </Pressable>
      ) : null}
    </View>
  );
}
