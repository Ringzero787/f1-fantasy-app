import React, { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type TextStyle,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { BORDER_RADIUS, COLORS, FONTS, SPACING } from '../config/constants';
import { useTheme } from '../hooks/useTheme';

interface TooltipTextProps {
  /** The visible label text */
  term: string;
  /** Definition shown in the tooltip popup */
  definition: string;
  /** Style applied to the term text */
  style?: TextStyle | (TextStyle | false | undefined | null)[];
  /** Style applied to the outer wrapper */
  containerStyle?: ViewStyle;
  /** If true, show a small ⓘ icon after the text */
  showIcon?: boolean;
}

const TOOLTIP_MAX_WIDTH = 260;
const TOOLTIP_PADDING = SPACING.md;
const ARROW_SIZE = 6;
const SCREEN_EDGE_MARGIN = 12;

export const TooltipText = React.memo(function TooltipText({
  term,
  definition,
  style,
  containerStyle,
  showIcon = false,
}: TooltipTextProps) {
  const theme = useTheme();
  const triggerRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0, width: 0 });
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const handlePress = useCallback(() => {
    triggerRef.current?.measureInWindow((px, py, width, height) => {
      setTipPos({ x: px, y: py + height + ARROW_SIZE, width });
      setVisible(true);
    });
  }, []);

  const dismiss = useCallback(() => setVisible(false), []);

  // Calculate tooltip horizontal position — center on trigger, clamp to screen
  const tooltipLeft = Math.max(
    SCREEN_EDGE_MARGIN,
    Math.min(
      tipPos.x + tipPos.width / 2 - TOOLTIP_MAX_WIDTH / 2,
      screenWidth - TOOLTIP_MAX_WIDTH - SCREEN_EDGE_MARGIN,
    ),
  );

  // Arrow horizontal position relative to tooltip
  const arrowLeft = Math.max(
    10,
    Math.min(
      tipPos.x + tipPos.width / 2 - tooltipLeft - ARROW_SIZE,
      TOOLTIP_MAX_WIDTH - ARROW_SIZE * 2 - 10,
    ),
  );

  // If tooltip would go off bottom of screen, show above instead
  const showAbove = tipPos.y + 80 > screenHeight;
  const tooltipTop = showAbove
    ? tipPos.y - ARROW_SIZE * 3 - 80 // rough estimate, will adjust via onLayout
    : tipPos.y;

  return (
    <>
      <TouchableOpacity
        ref={triggerRef}
        onPress={handlePress}
        activeOpacity={0.7}
        style={[styles.trigger, containerStyle]}
      >
        <Text style={[styles.termText, style]}>
          {term}
        </Text>
        {showIcon && (
          <Text style={[styles.infoIcon, { color: theme.primary }]}> ⓘ</Text>
        )}
        <View style={[styles.underline, { borderBottomColor: theme.primary + '50' }]} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={dismiss}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <View
            style={[
              styles.tooltip,
              {
                left: tooltipLeft,
                top: tooltipTop,
                backgroundColor: theme.cardElevated,
                borderColor: theme.border.accent,
              },
            ]}
          >
            {/* Arrow */}
            {!showAbove && (
              <View
                style={[
                  styles.arrowUp,
                  {
                    left: arrowLeft,
                    borderBottomColor: theme.cardElevated,
                  },
                ]}
              />
            )}
            <Text style={styles.tooltipTerm}>{term}</Text>
            <Text style={styles.tooltipDef}>{definition}</Text>
            {showAbove && (
              <View
                style={[
                  styles.arrowDown,
                  {
                    left: arrowLeft,
                    borderTopColor: theme.cardElevated,
                  },
                ]}
              />
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  termText: {
    // inherits style from parent via props
  },
  underline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoIcon: {
    fontSize: 11,
  },
  backdrop: {
    flex: 1,
  },
  tooltip: {
    position: 'absolute',
    maxWidth: TOOLTIP_MAX_WIDTH,
    paddingHorizontal: TOOLTIP_PADDING,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tooltipTerm: {
    fontSize: FONTS.sizes.sm,
    fontWeight: '700',
    color: COLORS.text.primary,
    marginBottom: 3,
  },
  tooltipDef: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text.secondary,
    lineHeight: 18,
  },
  arrowUp: {
    position: 'absolute',
    top: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  arrowDown: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
});
