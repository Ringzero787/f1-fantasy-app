/**
 * The shared standings message.
 *
 * This ends up pasted into Slack, a text message and an email, and the thing that ruins it in all
 * three is a line long enough to wrap: a wrapped row reads as two rows and the table stops being a
 * table. So the width is the property worth pinning, not the prose.
 */
import { DEFAULT_LIMIT, LINE_WIDTH, displayWidth, fitName, standingsText } from '../../src/simple/grid/shareStandings';
import type { StandingsRow } from '../../src/simple/grid/standings';

const row = (rank: number, name: string, shown: string, over: Partial<StandingsRow> = {}): StandingsRow => ({
  userId: `u${rank}`, rank, rankLabel: String(rank).padStart(2, '0'), name, team: 'TEAM',
  value: 0, shown, delta: '', isLeader: rank === 1, isMe: false,
  movement: '—', movementDir: 'flat', moonshot: null, ...over,
});

const many = (n: number) => Array.from({ length: n }, (_, i) => row(i + 1, `Player ${i + 1}`, String(2000 - i * 7)));

describe('standingsText', () => {
  it('leads with the league and what is being shown', () => {
    const out = standingsText({ leagueName: 'Apex Predators', caption: 'After round 17', rows: many(3) });
    expect(out.split('\n')[0]).toBe('APEX PREDATORS');
    expect(out.split('\n')[1]).toBe('AFTER ROUND 17');
  });

  it('never writes a line long enough to wrap in a message', () => {
    // The whole format exists to survive a narrow column. 34 is the budget.
    const out = standingsText({
      leagueName: 'A League With A Very Long Name Indeed',
      caption: 'After round 17',
      rows: many(20).map((r, i) => (i === 0 ? { ...r, name: 'Bartholomew Fotheringay-Smythe', shown: '12,345', movement: '▲ 12', movementDir: 'up' } : r)),
    });
    for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(LINE_WIDTH);
  });

  it('stops at twenty and says how many are left', () => {
    const out = standingsText({ leagueName: 'L', caption: 'Season', rows: many(26) });
    const body = out.split('\n').filter((l) => /^\s*\d/.test(l));
    expect(body).toHaveLength(DEFAULT_LIMIT);
    expect(out).toContain('+6 more');
  });

  it('says nothing about the rest when everyone fits', () => {
    expect(standingsText({ leagueName: 'L', caption: 'Season', rows: many(9) })).not.toContain('more');
  });

  it('shows movement only when someone moved', () => {
    const rows = [
      row(1, 'Up', '100', { movement: '▲ 2', movementDir: 'up' }),
      row(2, 'Flat', '90'),
      row(3, 'Down', '80', { movement: '▼ 1', movementDir: 'down' }),
    ];
    const [a, b, c] = standingsText({ leagueName: 'L', caption: 'S', rows }).split('\n').slice(3);
    expect(a).toContain('▲2');
    expect(b).not.toContain('—');   // a column of dashes is noise in a message
    expect(c).toContain('▼1');
  });

  it('keeps scores and ranks in line with each other', () => {
    const rows = [row(1, 'A', '1,284'), row(10, 'B', '986'), row(100, 'C', '7')];
    const lines = standingsText({ leagueName: 'L', caption: 'S', rows }).split('\n').slice(3);
    const ends = lines.map((l) => l.length);
    expect(new Set(ends).size).toBe(1);   // every row ends at the same column
  });

  it('gives the caller nothing to share when there is nothing to share', () => {
    expect(standingsText({ leagueName: 'L', caption: 'S', rows: [] })).toBe('');
  });

  it('carries no code fence, because two of the three places this goes would show it literally', () => {
    expect(standingsText({ leagueName: 'L', caption: 'S', rows: many(3) })).not.toContain('```');
  });
});

describe('fitName', () => {
  it('leaves a name that fits alone', () => {
    expect(fitName('Nathan Shanks', 18)).toBe('Nathan Shanks');
  });

  it('cuts hard rather than losing most of the room to a word break', () => {
    // Breaking at the space would leave "Alexander…" and waste eight characters of a narrow line.
    expect(fitName('Alexander Fitzgerald', 18)).toBe('Alexander Fitzger…');
  });

  it('breaks on a word when one falls near the end', () => {
    expect(fitName('Jonathan Bly Smith', 18)).toBe('Jonathan Bly Smith');
    expect(fitName('Jonathan Bly Smithe', 18)).toBe('Jonathan Bly…');
  });

  it('cuts a single long word at the width', () => {
    expect(fitName('Bartholomewwwwwwwwwwwww', 18)).toBe('Bartholomewwwwwww…');
  });

  it('truncates a heading to its own wider budget', () => {
    expect(fitName('A League With A Very Long Name Indeed', 34).length).toBeLessThanOrEqual(34);
  });

  it('tidies the whitespace a display name arrives with', () => {
    expect(fitName('  Sam   Okafor  ', 18)).toBe('Sam Okafor');
  });
});

describe('names that are not ASCII', () => {
  // A display name is whatever Google or Apple hands over. Nothing in the sign-in path restricts it
  // to ASCII, and the app ships in Japanese and Chinese, so these are real players and not edge cases.

  it('counts a CJK character as the two columns it occupies', () => {
    expect(displayWidth('田中')).toBe(4);
    expect(displayWidth('Tanaka')).toBe(6);
    expect(displayWidth('ﾊﾝｶｸ')).toBe(4);   // halfwidth kana really is one column each
  });

  it('keeps a wide name inside the budget instead of letting it take the whole line', () => {
    // Fifteen characters, thirty columns: under the old code-unit maths this passed untouched.
    const rows = [row(1, '習近平習近平習近平習近平習近平', '1,284')];
    const out = standingsText({ leagueName: '联赛', caption: '第 17 轮', rows });
    for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(LINE_WIDTH);
  });

  it('never cuts a character in half', () => {
    // A cut surrogate is an invalid string, and what reaches the share sheet is a replacement glyph.
    for (const name of ['😀'.repeat(20), '🏎️🏁'.repeat(8), '漢'.repeat(20)]) {
      const got = fitName(name, 18);
      expect(got).toBe([...got].join(''));                       // survives a code-point round trip
      expect(/[\uD800-\uDBFF]$/.test(got.replace(/…$/, ''))).toBe(false);  // no dangling high surrogate
    }
  });

  it('treats a combining accent as part of the letter it sits on', () => {
    expect(displayWidth('é')).toBe(1);
    expect(fitName('José Maria Gonzalez', 18)).toContain('José');
  });

  it('holds the whole-line budget with wide names, long scores and movement together', () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(i + 1, i % 2 ? '山田太郎山田太郎山田' : 'Bartholomew Fotheringay', '123,456', { movement: '▲ 12', movementDir: 'up' }));
    const out = standingsText({ leagueName: '東京アンダーカットリーグ', caption: '第 17 ラウンド', rows });
    for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(LINE_WIDTH);
  });
});

describe('the heading', () => {
  it('is measured after it is uppercased, not before', () => {
    // German ß becomes SS and ﬁ becomes FI. A heading measured first is over budget by the time it
    // is written, which is the one line the reader sees before anything else.
    const out = standingsText({ leagueName: 'Straßenrennen Großerpreisliga Süß', caption: 'Nach Runde 17', rows: many(3) });
    for (const line of out.split('\n')) expect(displayWidth(line)).toBeLessThanOrEqual(LINE_WIDTH);
    expect(out.split('\n')[0]).toBe(out.split('\n')[0].toUpperCase());
  });
});
