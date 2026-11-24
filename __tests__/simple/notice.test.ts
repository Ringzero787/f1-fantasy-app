/**
 * F-174: the server notice banner — the parser (fail closed), its window and version bounds, the
 * link allowlist and the dismissal list.
 */
import {
  parseNotice, noticeToShow, noticeInWindow, noticeForVersion, isNoticeUrl, compareVersions,
  isNoticeDismissed, withDismissed, MAX_DISMISSED_NOTICES, NOTICE_LIMITS,
} from '../../src/simple/grid/notice';

const RESET = {
  id: 'season-reset-2027',
  title: 'Undercut 2027: every team starts fresh',
  body: 'The 2026 season is over. Every Undercut team starts again for 2027: an empty lineup, a $1,000 budget and zero points. Your team keeps its name and stays in its leagues, and your 2026 results are saved. The market is open all winter. Round 1 is Australia on 14 March 2027.',
  tone: 'info',
  from: '2026-12-10T00:00:00Z',
  until: '2027-03-16T00:00:00Z',
  minVersion: '2.9.0',
};
const T = (iso: string) => Date.parse(iso);
const show = (raw: unknown, over: Partial<{ nowMs: number; appVersion: string | null; dismissedIds: string[] }> = {}) =>
  noticeToShow(raw, { nowMs: T('2027-01-01T00:00:00Z'), appVersion: '2.9.0', dismissedIds: [], ...over });

describe('parseNotice: valid', () => {
  it('parses the season-reset example', () => {
    expect(parseNotice(RESET)).toEqual({
      id: 'season-reset-2027', title: RESET.title, body: RESET.body, tone: 'info',
      fromMs: T('2026-12-10T00:00:00Z'), untilMs: T('2027-03-16T00:00:00Z'),
      minVersion: '2.9.0', maxVersion: null, url: null,
    });
  });

  it('needs only id, title and body; tone defaults to info', () => {
    const n = parseNotice({ id: 'a', title: 'Hi', body: 'There' });
    expect(n).toMatchObject({ tone: 'info', fromMs: null, untilMs: null, minVersion: null, maxVersion: null, url: null });
  });

  it('trims the text and keeps line breaks in the body', () => {
    expect(parseNotice({ id: 'a', title: '  Hi  ', body: ' one\r\ntwo ' })).toMatchObject({ title: 'Hi', body: 'one\ntwo' });
  });

  it('accepts warn, offsets in the dates and Firestore Timestamps', () => {
    expect(parseNotice({ ...RESET, tone: 'warn' })?.tone).toBe('warn');
    expect(parseNotice({ ...RESET, from: '2026-12-10T10:00:00+10:00' })?.fromMs).toBe(T('2026-12-10T00:00:00Z'));
    const ts = { seconds: 1_800_000_000, nanoseconds: 500_000_000 };
    expect(parseNotice({ ...RESET, from: ts, until: undefined })?.fromMs).toBe(1_800_000_000_500);
    expect(parseNotice({ ...RESET, until: { toMillis: () => 1_900_000_000_000 } })?.untilMs).toBe(1_900_000_000_000);
  });

  it('ignores an unknown key (a later build may add fields)', () => {
    expect(parseNotice({ ...RESET, ctaLabel: 'Go' })?.id).toBe(RESET.id);
  });
});

describe('parseNotice: anything malformed means no banner', () => {
  it.each([
    ['not an object', 'hello'],
    ['null', null],
    ['an array', [RESET]],
    ['no id', { ...RESET, id: undefined }],
    ['empty id', { ...RESET, id: '' }],
    ['id with a space', { ...RESET, id: 'season reset' }],
    ['id too long', { ...RESET, id: 'x'.repeat(NOTICE_LIMITS.id + 1) }],
    ['numeric id', { ...RESET, id: 2027 }],
    ['no title', { ...RESET, title: undefined }],
    ['blank title', { ...RESET, title: '   ' }],
    ['no body', { ...RESET, body: undefined }],
    ['body not a string', { ...RESET, body: ['a'] }],
    ['two-line title', { ...RESET, title: 'one\ntwo' }],
    ['control character', { ...RESET, body: 'bell\u0007' }],
    ['bidi override', { ...RESET, title: 'abc‮def' }],
    ['unknown tone', { ...RESET, tone: 'danger' }],
    ['from not ISO', { ...RESET, from: '10 Dec 2026' }],
    ['from without a zone', { ...RESET, from: '2026-12-10T00:00:00' }],
    ['until a number', { ...RESET, until: 1_800_000_000_000 }],
    ['until before from', { ...RESET, from: '2027-01-02T00:00:00Z', until: '2027-01-01T00:00:00Z' }],
    ['until equal to from', { ...RESET, until: RESET.from }],
    ['minVersion not a version', { ...RESET, minVersion: '2.9.0-beta' }],
    ['maxVersion a number', { ...RESET, maxVersion: 3 }],
    ['min above max', { ...RESET, minVersion: '3.0.0', maxVersion: '2.9.9' }],
  ])('%s', (_label, raw) => {
    expect(parseNotice(raw)).toBeNull();
  });

  it('caps the title and body lengths', () => {
    expect(parseNotice({ ...RESET, title: 'x'.repeat(NOTICE_LIMITS.title) })).not.toBeNull();
    expect(parseNotice({ ...RESET, title: 'x'.repeat(NOTICE_LIMITS.title + 1) })).toBeNull();
    expect(parseNotice({ ...RESET, body: 'x'.repeat(NOTICE_LIMITS.body) })).not.toBeNull();
    expect(parseNotice({ ...RESET, body: 'x'.repeat(NOTICE_LIMITS.body + 1) })).toBeNull();
  });

  it('keeps HTML as literal text (it is never rendered as markup)', () => {
    expect(parseNotice({ ...RESET, body: '<b>hi</b>' })?.body).toBe('<b>hi</b>');
  });
});

describe('the link', () => {
  it.each([
    'https://undercut.humannpc.com/2027',
    'https://humannpc.com/undercut',
    'https://pitwall.humannpc.com',
    'https://play.google.com/store/apps/details?id=com.undercut.app',
    'https://apps.apple.com/app/id6759428075',
    'amzn://apps/android?p=com.undercut.app',
  ])('allows %s', (u) => {
    expect(isNoticeUrl(u)).toBe(true);
    expect(parseNotice({ ...RESET, url: u })?.url).toBe(u);
  });

  it.each([
    'http://undercut.humannpc.com',
    'https://evilhumannpc.com',
    'https://humannpc.com.evil.example',
    'https://humannpc.com@evil.example',
    'https://evil.example/humannpc.com',
    'https://undercut.humannpc.com:8443/x',
    'https://undercut.humannpc.com\\@evil.example',
    'https://undercut.humannpc.com/a b',
    'javascript:alert(1)',
    'mailto:a@humannpc.com',
    'intent://x#Intent;end',
    'https://undercut.humannpc.com/' + 'x'.repeat(NOTICE_LIMITS.url),
    42,
  ])('drops %s but keeps the notice', (u) => {
    expect(isNoticeUrl(u)).toBe(false);
    const n = parseNotice({ ...RESET, url: u });
    expect(n).not.toBeNull();
    expect(n!.url).toBeNull();
  });
});

describe('the time window', () => {
  const n = parseNotice(RESET)!;
  it('is closed before from, open from it, closed from until', () => {
    expect(noticeInWindow(n, T('2026-12-09T23:59:59Z'))).toBe(false);
    expect(noticeInWindow(n, T('2026-12-10T00:00:00Z'))).toBe(true);
    expect(noticeInWindow(n, T('2027-03-15T23:59:59Z'))).toBe(true);
    expect(noticeInWindow(n, T('2027-03-16T00:00:00Z'))).toBe(false);
  });
  it('is unbounded on a side that is not set', () => {
    const open = parseNotice({ id: 'a', title: 't', body: 'b' })!;
    expect(noticeInWindow(open, 0)).toBe(true);
    expect(noticeInWindow(open, T('2100-01-01T00:00:00Z'))).toBe(true);
  });
  it('decides noticeToShow', () => {
    expect(show(RESET, { nowMs: T('2026-12-01T00:00:00Z') })).toBeNull();
    expect(show(RESET)?.id).toBe(RESET.id);
    expect(show(RESET, { nowMs: T('2027-04-01T00:00:00Z') })).toBeNull();
  });
});

describe('the version bounds', () => {
  it('compares dotted versions numerically', () => {
    expect(compareVersions('2.10.0', '2.9.0')).toBe(1);
    expect(compareVersions('2.9', '2.9.0')).toBe(0);
    expect(compareVersions('2.8.9', '2.9.0')).toBe(-1);
    expect(compareVersions('2.9.x', '2.9.0')).toBeNull();
  });
  it('min and max are inclusive', () => {
    const n = parseNotice({ ...RESET, minVersion: '2.9.0', maxVersion: '2.9.5' })!;
    expect(noticeForVersion(n, '2.8.9')).toBe(false);
    expect(noticeForVersion(n, '2.9.0')).toBe(true);
    expect(noticeForVersion(n, '2.9.5')).toBe(true);
    expect(noticeForVersion(n, '2.10.0')).toBe(false);
  });
  it('an unknown app version fails a bounded notice and passes an unbounded one', () => {
    expect(noticeForVersion(parseNotice(RESET)!, null)).toBe(false);
    expect(noticeForVersion(parseNotice(RESET)!, 'dev')).toBe(false);
    expect(noticeForVersion(parseNotice({ ...RESET, minVersion: undefined })!, null)).toBe(true);
  });
  it('decides noticeToShow', () => {
    expect(show(RESET, { appVersion: '2.8.0' })).toBeNull();
    expect(show({ ...RESET, maxVersion: '2.9.0' }, { appVersion: '2.9.1' })).toBeNull();
  });
});

describe('dismissal', () => {
  it('a dismissed id is not shown; a new id is', () => {
    expect(show(RESET, { dismissedIds: [RESET.id] })).toBeNull();
    expect(show({ ...RESET, id: 'round-1-close' }, { dismissedIds: [RESET.id] })?.id).toBe('round-1-close');
  });
  it('withDismissed adds once, moves a repeat to the end and keeps the newest', () => {
    expect(withDismissed([], 'a')).toEqual(['a']);
    expect(withDismissed(['a', 'b'], 'a')).toEqual(['b', 'a']);
    const many = Array.from({ length: MAX_DISMISSED_NOTICES }, (_, i) => `n${i}`);
    const next = withDismissed(many, 'new');
    expect(next).toHaveLength(MAX_DISMISSED_NOTICES);
    expect(next[0]).toBe('n1');
    expect(next[next.length - 1]).toBe('new');
  });
  it('survives a corrupt stored list', () => {
    expect(isNoticeDismissed(undefined, 'a')).toBe(false);
    expect(isNoticeDismissed('a' as unknown as string[], 'a')).toBe(false);
    expect(withDismissed(null, 'a')).toEqual(['a']);
    expect(withDismissed([1, 'b'] as unknown as string[], 'a')).toEqual(['b', 'a']);
  });
});

describe('F-174 hardening (security review)', () => {
  const { isNoticeUrl, parseNotice } = require('../../src/simple/grid/notice');
  it('notice links need a plain ASCII host', () => {
    expect(isNoticeUrl('https://evil.com%2f.humannpc.com/x')).toBe(false);
    expect(isNoticeUrl('https://evil.com\uFF20x.humannpc.com/')).toBe(false);
    expect(isNoticeUrl('https://www.humannpc.com/undercut')).toBe(true);
  });
  it('a title with a line or paragraph separator is refused', () => {
    expect(parseNotice({ id: 'a', title: 'one\u2028two', body: 'b' })).toBeNull();
    expect(parseNotice({ id: 'a', title: 'one\u2029two', body: 'b' })).toBeNull();
  });
});
