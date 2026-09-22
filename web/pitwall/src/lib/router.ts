import { useEffect, useState } from 'react';

export const PAGES = ['BRIEFING', 'BOARD', 'CIRCUIT', 'PACE LAB', 'MARKET', 'LINEUP LAB', 'SEASON', 'WIRE'] as const;
export type PageName = (typeof PAGES)[number];

const slug = (p: PageName) => p.toLowerCase().replace(/ /g, '-');
export const pathFor = (p: PageName): string => (p === 'BRIEFING' ? '/' : `/${slug(p)}`);
export function pageFor(pathname: string): PageName {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return PAGES.find((p) => pathFor(p) === clean) ?? 'BRIEFING';
}
/** `/h` is the app-to-web sign-in handoff; the single-use code rides in the fragment so it never reaches a server log. */
export const isHandoffPath = (pathname: string): boolean => pathname.replace(/\/+$/, '') === '/h';

export function usePage(): [PageName, (p: PageName) => void] {
  const [page, setPage] = useState<PageName>(() => pageFor(window.location.pathname));
  useEffect(() => {
    const onPop = () => setPage(pageFor(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (p: PageName) => {
    if (pathFor(p) !== window.location.pathname) window.history.pushState({}, '', pathFor(p));
    setPage(p);
    window.scrollTo(0, 0);
  };
  return [page, go];
}
