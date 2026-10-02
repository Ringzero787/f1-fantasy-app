import { useEffect, useState } from 'react';

/**
 * Tab order, and it is a product decision rather than a list.
 *
 * The tab strip scrolls horizontally on a phone, so anything past about the fourth tab is off the
 * edge and effectively does not exist. LINEUP LAB was sixth. It is the page that answers "what do I
 * change to score more", which is the thing somebody just paid for, so it sits second — first is
 * the briefing they land on, and the lab is one tap from it on any screen.
 */
export const PAGES = ['BRIEFING', 'LINEUP LAB', 'BOARD', 'CIRCUIT', 'PACE LAB', 'MARKET', 'SEASON', 'WIRE'] as const;
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
