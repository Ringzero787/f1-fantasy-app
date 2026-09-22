const KEY = 'pw.theme';
export type Theme = 'dark' | 'light';

export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'dark' || set === 'light') return set;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
/** Follows the system until the user toggles; the choice is remembered on this device. */
export function initTheme(): void {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset.theme = saved;
  } catch { /* private mode: keep following the system */ }
}
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { window.localStorage.setItem(KEY, next); } catch { /* not persisted */ }
  return next;
}
