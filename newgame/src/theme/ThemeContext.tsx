import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeTokens, TLTokens, ThemeMode, Palette } from './tokens';

interface ThemeContextValue {
  t: TLTokens;
  mode: ThemeMode;
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: Palette) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'tl_theme_prefs_v1';

interface StoredPrefs {
  mode?: ThemeMode;
  palette?: Palette;
}

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') {
    const sys = Appearance.getColorScheme();
    return sys === 'light' ? 'light' : 'dark';
  }
  return mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [palette, setPaletteState] = useState<Palette>('cornflower');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(resolveTheme('auto'));

  // Hydrate from storage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as StoredPrefs;
          if (parsed.mode) setModeState(parsed.mode);
          if (parsed.palette) setPaletteState(parsed.palette);
        } catch {
          // ignore
        }
      })
      .catch(() => undefined);
  }, []);

  // Resolve theme + listen to system changes when in auto
  useEffect(() => {
    setResolvedTheme(resolveTheme(mode));
    if (mode !== 'auto') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setResolvedTheme(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => sub.remove();
  }, [mode]);

  const persist = useCallback((next: Partial<StoredPrefs>) => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const current = raw ? (JSON.parse(raw) as StoredPrefs) : {};
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...next })).catch(() => undefined);
    });
  }, []);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      persist({ mode: m });
    },
    [persist]
  );

  const setPalette = useCallback(
    (p: Palette) => {
      setPaletteState(p);
      persist({ palette: p });
    },
    [persist]
  );

  const t = makeTokens({ palette, theme: resolvedTheme });

  return <ThemeContext.Provider value={{ t, mode, palette, setMode, setPalette }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): TLTokens {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx.t;
}

export function useThemePrefs(): Pick<ThemeContextValue, 'mode' | 'palette' | 'setMode' | 'setPalette'> {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePrefs must be used inside ThemeProvider');
  return { mode: ctx.mode, palette: ctx.palette, setMode: ctx.setMode, setPalette: ctx.setPalette };
}
