import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePrefsStore } from '../../store/prefs.store';
import { S_COLORS_LIGHT, S_COLORS_DARK, S_FONTS, S_SPACING, S_RADIUS } from '../theme/simpleTheme';

export function useSimpleTheme() {
  const systemScheme = useColorScheme();
  const displayScale = usePrefsStore((s) => s.displayScale);
  const themeMode = usePrefsStore((s) => s.themeMode);

  const isDark = themeMode === 'system'
    ? (systemScheme ?? 'light') === 'dark'
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

    return { colors, fonts, spacing, radius: S_RADIUS, isDark };
  }, [colors, displayScale, isDark]);
}
