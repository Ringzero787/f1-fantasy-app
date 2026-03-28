import { useMemo } from 'react';
import { usePrefsStore } from '../../store/prefs.store';
import { S_FONTS, S_SPACING } from '../theme/simpleTheme';

export function useSimpleScale() {
  const displayScale = usePrefsStore((s) => s.displayScale);

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

    return { scaled, fonts, spacing, displayScale };
  }, [displayScale]);
}
