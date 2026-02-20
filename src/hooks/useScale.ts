import { useMemo } from 'react';
import { usePrefsStore } from '../store/prefs.store';
import { FONTS, SPACING } from '../config/constants';

export function useScale() {
  const displayScale = usePrefsStore((s) => s.displayScale);

  return useMemo(() => {
    const scaled = (value: number) => Math.round(value * displayScale);

    const scaledFonts = {
      xs: scaled(FONTS.sizes.xs),
      sm: scaled(FONTS.sizes.sm),
      md: scaled(FONTS.sizes.md),
      lg: scaled(FONTS.sizes.lg),
      xl: scaled(FONTS.sizes.xl),
      xxl: scaled(FONTS.sizes.xxl),
      xxxl: scaled(FONTS.sizes.xxxl),
    };

    const scaledSpacing = {
      xs: scaled(SPACING.xs),
      sm: scaled(SPACING.sm),
      md: scaled(SPACING.md),
      lg: scaled(SPACING.lg),
      xl: scaled(SPACING.xl),
      xxl: scaled(SPACING.xxl),
    };

    const scaledIcon = (base: number) => scaled(base);

    return { scaled, scaledFonts, scaledSpacing, scaledIcon, displayScale };
  }, [displayScale]);
}
