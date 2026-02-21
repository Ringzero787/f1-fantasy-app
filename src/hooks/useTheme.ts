import { useMemo } from 'react';
import { usePrefsStore } from '../store/prefs.store';
import { DEFAULT_THEME, CONSTRUCTOR_THEMES, buildTheme, type ThemeColors } from '../config/themes';

export function useTheme(): ThemeColors {
  const themeId = usePrefsStore((s) => s.constructorTheme);

  return useMemo(() => {
    if (themeId === 'default') return DEFAULT_THEME;
    const def = CONSTRUCTOR_THEMES[themeId];
    if (!def) return DEFAULT_THEME;
    return buildTheme(def.primary, def.secondary, {
      background: def.background,
      surface: def.surface,
      card: def.card,
      cardElevated: def.cardElevated,
    });
  }, [themeId]);
}
