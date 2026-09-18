import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePrefsStore } from '../../store/prefs.store';
import {
  S_COLORS_LIGHT,
  S_COLORS_DARK,
  S_FONTS,
  S_FONT_FAMILY,
  S_SPACING,
  S_RADIUS,
  S_TYPE,
} from '../theme/simpleTheme';

export function useSimpleTheme() {
  const systemScheme = useColorScheme();
  const displayScale = usePrefsStore((s) => s.displayScale);
  const themeMode = usePrefsStore((s) => s.themeMode);

  const isDark = themeMode === 'system'
    ? (systemScheme ?? 'dark') === 'dark'
    : themeMode === 'dark';
  const colors = isDark ? S_COLORS_DARK : S_COLORS_LIGHT;

  return useMemo(() => {
    const scaled = (value: number) => Math.round(value * displayScale);

    const fonts = {
      xs: scaled(S_FONTS.sizes.xs),
      sm: scaled(S_FONTS.sizes.sm),
      md: scaled(S_FONTS.sizes.md),
      lg: scaled(S_FONTS.sizes.lg),
      xl: scaled(S_FONTS.sizes.xl),
      xxl: scaled(S_FONTS.sizes.xxl),
      hero: scaled(S_FONTS.sizes.hero),
    };

    const spacing = {
      xs: scaled(S_SPACING.xs),
      sm: scaled(S_SPACING.sm),
      md: scaled(S_SPACING.md),
      lg: scaled(S_SPACING.lg),
      xl: scaled(S_SPACING.xl),
      xxl: scaled(S_SPACING.xxl),
    };

    // Section label: 11px mono 700, letter-spacing 0.18em, uppercase, muted.
    const label = {
      fontFamily: S_FONT_FAMILY.mono.bold,
      fontSize: scaled(S_TYPE.sectionLabel),
      letterSpacing: scaled(S_TYPE.sectionLabel) * 0.18,
      textTransform: 'uppercase' as const,
      color: colors.text.muted,
    };

    // Mono data text (numbers, codes, captions).
    const mono = (size: number, weight: 'medium' | 'bold' = 'bold') => ({
      fontFamily: S_FONT_FAMILY.mono[weight],
      fontSize: scaled(size),
      color: colors.text.primary,
    });

    // UI text (Unbounded). 900 for names/titles/numerals, 700 for values.
    const ui = (size: number, weight: 'regular' | 'bold' | 'black' = 'black') => ({
      fontFamily: S_FONT_FAMILY.ui[weight],
      fontSize: scaled(size),
      color: colors.text.primary,
    });

    return {
      colors,
      fonts,
      spacing,
      radius: S_RADIUS,
      isDark,
      family: S_FONT_FAMILY,
      type: S_TYPE,
      label,
      mono,
      ui,
      // Screen title: 26px Unbounded 900, tracking -0.03em, uppercase.
      title: {
        fontFamily: S_FONT_FAMILY.ui.black,
        fontSize: scaled(S_TYPE.screenTitle),
        lineHeight: scaled(S_TYPE.screenTitle),
        letterSpacing: -scaled(S_TYPE.screenTitle) * 0.03,
        textTransform: 'uppercase' as const,
        color: colors.text.primary,
      },
      scaled,
    };
  }, [colors, displayScale, isDark]);
}
