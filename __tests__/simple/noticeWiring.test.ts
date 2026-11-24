/**
 * F-174: the notice store persists dismissals per id on the device, and the Team panel renders the
 * banner only when there is a notice to show.
 *
 * The panel itself cannot be rendered here (ts-jest in a node environment, react-native ignored; see
 * aceGateShape.test.ts), so its wiring is read off the source, like shareWiring.test.ts.
 */
import fs from 'fs';
import path from 'path';

const mockMem = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockMem.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockMem.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockMem.delete(k)),
  },
}));

import { useNoticeStore } from '../../src/store/notice.store';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('the dismissal store', () => {
  it('records a dismissal by id and writes it to local storage', async () => {
    useNoticeStore.getState().dismiss('season-reset-2027');
    expect(useNoticeStore.getState().dismissedIds).toEqual(['season-reset-2027']);
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse(mockMem.get('notice-dismissals') ?? '{}');
    expect(stored.state).toEqual({ dismissedIds: ['season-reset-2027'] });
  });

  it('a second dismissal of the same id does not duplicate it', () => {
    useNoticeStore.getState().dismiss('round-1-close');
    useNoticeStore.getState().dismiss('season-reset-2027');
    expect(useNoticeStore.getState().dismissedIds).toEqual(['round-1-close', 'season-reset-2027']);
  });
});

describe('the Team panel wiring', () => {
  const panel = read('src/simple/grid/GridTeamPanel.tsx');

  it('renders the banner only when there is a notice, and nothing otherwise', () => {
    expect(panel).toContain('{notice ? <GridNoticeBanner notice={notice} onDismiss={dismissNotice}');
    expect(panel).toMatch(/notice=\{notice\}[^\n]*\/> : null\}/);
  });

  it('sits directly under the header', () => {
    expect(panel).toMatch(/<\/ScreenHeader>\s*\{\/\* F-174[^\n]*\*\/\}\s*\{notice \?/);
  });

  it('reads the notice through useNotice with the ticking clock, before the no-team return', () => {
    const hook = panel.indexOf('useNotice(now.getTime())');
    expect(hook).toBeGreaterThan(0);
    expect(hook).toBeLessThan(panel.indexOf('if (!hasTeam) {'));
  });

  it('the banner renders text only, with labelled controls and no line limits', () => {
    const banner = read('src/simple/grid/GridNoticeBanner.tsx');
    expect(banner).not.toMatch(/dangerouslySetInnerHTML|WebView|numberOfLines/);
    expect(banner).toContain('accessibilityLabel="Dismiss notice"');
    expect(banner).toContain('accessibilityRole="link"');
    // the link is checked again at the point it is opened
    expect(banner).toMatch(/notice\.url && isNoticeUrl\(notice\.url\)/);
  });

  it('the hook reads the config the app already fetches, and makes no request of its own', () => {
    const hook = read('src/simple/hooks/useNotice.ts');
    expect(hook).toContain('s.appConfig?.notice');
    expect(hook).not.toMatch(/firebase|fetch\(|getDoc/);
  });
});
