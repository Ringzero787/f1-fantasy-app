/**
 * F-123: the public name line cannot carry a watchlist term, and the marketing hero
 * cannot be an APK. Portal copy is pasted from docs/store/; the site is public/index.html.
 */
import fs from 'fs';
import path from 'path';

const root = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const WATCH = /\b(F1|Formula 1|FIA|Grand Prix)\b/i;

function fenced(md: string, heading: string): string {
  const i = md.indexOf(heading);
  expect(i).toBeGreaterThanOrEqual(0);
  const rest = md.slice(i);
  const open = rest.indexOf('```');
  const close = rest.indexOf('```', open + 3);
  return rest.slice(open + 3, close).trim();
}

describe('store name lines', () => {
  it('Play title and short description have no watchlist term', () => {
    const md = read('docs/store/play-listing.md');
    expect(WATCH.test(fenced(md, '## Title'))).toBe(false);
    expect(WATCH.test(fenced(md, '## Short description'))).toBe(false);
    expect(fenced(md, '## Short description').length).toBeLessThanOrEqual(80);
  });

  it('App Store name and subtitle have no watchlist term', () => {
    const md = read('docs/store/app-store-listing.md');
    expect(WATCH.test(fenced(md, '## Name'))).toBe(false);
    expect(WATCH.test(fenced(md, '## Subtitle'))).toBe(false);
    expect(fenced(md, '## Name').length).toBeLessThanOrEqual(30);
    expect(fenced(md, '## Subtitle').length).toBeLessThanOrEqual(30);
  });

  it('Amazon title still has no watchlist term', () => {
    expect(WATCH.test(fenced(read('docs/store/amazon-listing.md'), '## Title'))).toBe(false);
  });
});

describe('marketing site', () => {
  const html = read('public/index.html');
  it('is named Undercut, not The Undercut, and the title is not a watchlist name', () => {
    expect(html).not.toContain('The Undercut');
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    expect(title).toBe('Undercut');
    expect(WATCH.test(title)).toBe(false);
    expect(html).toMatch(/<h1>[^<]*Undercut/);
  });
  it('leads with store badges, not an APK', () => {
    expect(html).not.toMatch(/undercut\.apk/);
    expect(html).toContain('apps.apple.com');
    expect(html).toContain('play.google.com/store/apps/details?id=com.undercut.app');
  });
  it('names private league, contracts, Ace, and join-by-code', () => {
    expect(html).toMatch(/private league/i);
    expect(html).toMatch(/Contracts/);
    expect(html).toMatch(/>Ace</);
    expect(html).toContain('href="/join"');
    expect(html).toContain('images/screen-home.png');
    expect(html).toContain('images/screen-team.png');
    expect(html).toContain('images/screen-leagues.png');
  });
});
