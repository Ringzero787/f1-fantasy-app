/**
 * League standings as text you can paste anywhere (F-083).
 *
 * The point of this is the end of a race weekend: someone wants the whole league in one message so
 * the group can argue about it, and the commissioner wants to call people out by name. So it has to
 * survive being pasted into Slack, a text message and an email, and it has to fit on a screen
 * without scrolling.
 *
 * That shapes every decision here:
 *
 * - **No code fence.** Wrapping in backticks makes Slack render it in monospace and align
 *   perfectly, and makes SMS and email show three literal backticks. Two of the three places this
 *   is going would be worse off, so the layout instead degrades gracefully: every line starts with
 *   a rank and ends with a score, which reads in order even when a proportional font throws the
 *   columns out.
 * - **Narrow.** Lines are capped at LINE_WIDTH columns so a phone keyboard, a Slack sidebar and a
 *   quoted email reply do not wrap them. A wrapped row reads as two rows and the table falls apart.
 * - **Movement only when there is movement.** A column of "—" is noise in a message, however much
 *   it belongs on screen.
 *
 * Width is measured in display columns, not characters. A name is whatever the player's Google or
 * Apple account calls them, which is not restricted to ASCII anywhere in the sign-in path, and the
 * app ships in Japanese and Chinese. One CJK character occupies two monospace columns, so counting
 * code units would let a fifteen-character name quietly take thirty, which is the whole line.
 *
 * Pure, so it is tested without a React Native runtime.
 */
import type { StandingsRow } from './standings';

/** Everything past this is a second screen in most apps, and the ask was the top of the table. */
export const DEFAULT_LIMIT = 20;
/** The budget every line obeys, in display columns. */
export const LINE_WIDTH = 34;

/**
 * Ranges that occupy two monospace columns. Written as escapes rather than literal characters so
 * the boundaries are reviewable: the first attempt used literals and silently omitted CJK Unified
 * Ideographs, which is most of Chinese and Japanese and the entire reason this exists.
 */
const WIDE = new RegExp(
  '^[' +
  '\\u1100-\\u115F' +      // Hangul Jamo
  '\\u2E80-\\u303E' +      // CJK radicals, Kangxi, CJK symbols and punctuation
  '\\u3041-\\u33FF' +      // kana, Bopomofo, compatibility jamo, CJK compatibility
  '\\u3400-\\u4DBF' +      // CJK Extension A
  '\\u4E00-\\u9FFF' +      // CJK Unified Ideographs — the big one
  '\\uA960-\\uA97F' +      // Hangul Jamo Extended-A
  '\\uAC00-\\uD7A3' +      // Hangul syllables
  '\\uF900-\\uFAFF' +      // CJK compatibility ideographs
  '\\uFE10-\\uFE19\\uFE30-\\uFE6F' +   // vertical and compatibility forms
  '\\uFF01-\\uFF60' +      // fullwidth forms (halfwidth kana above FF60 is one column)
  '\\uFFE0-\\uFFE6' +      // fullwidth signs
  ']$',
);
/** Combining marks and joiners, which occupy none: they sit on the character before them. */
const ZERO = /^[\u0300-\u036F\u0483-\u0489\u0591-\u05BD\u064B-\u065F\u0E31\u0E34-\u0E3A\u200B-\u200F\u2060-\u206F\uFE00-\uFE0F\uFE20-\uFE2F]$/u;

/** How many columns one code point takes. Emoji are wide; a combining accent is free. */
export function charWidth(cp: string): number {
  if (ZERO.test(cp)) return 0;
  if (WIDE.test(cp)) return 2;
  return cp.codePointAt(0)! > 0xffff ? 2 : 1;   // astral: emoji and the CJK extensions
}

/** The columns a string occupies, iterating code points so a surrogate pair counts once. */
export const displayWidth = (s: string): number => [...s].reduce((n, c) => n + charWidth(c), 0);

/** Pad to a column count rather than a character count. */
export const padTo = (s: string, cols: number): string => s + ' '.repeat(Math.max(0, cols - displayWidth(s)));
export const padStartTo = (s: string, cols: number): string => ' '.repeat(Math.max(0, cols - displayWidth(s))) + s;

/**
 * Truncation that still reads as a name, measured and cut in display columns.
 *
 * Iterates code points, so an emoji or a CJK character is never split down the middle — a cut
 * surrogate is an invalid string, and what reaches the share sheet is a replacement glyph.
 */
export function fitName(name: string, cols: number): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (displayWidth(clean) <= cols) return clean;

  const room = cols - 1;                        // the ellipsis costs one
  let kept = '';
  let used = 0;
  for (const cp of clean) {
    const w = charWidth(cp);
    if (used + w > room) break;
    kept += cp;
    used += w;
  }
  // Break on a word when one falls near the end; otherwise a hard cut loses less of the name.
  const space = kept.lastIndexOf(' ');
  const body = space >= room - 6 ? kept.slice(0, space) : kept;
  return body.trimEnd() + '…';
}

export interface StandingsTextInput {
  leagueName: string;
  /** What is being shown, e.g. "SEASON" or "AFTER ROUND 17" — the panel's own selector label. */
  caption: string;
  rows: StandingsRow[];
  limit?: number;
}

/**
 * The shared message. Returns an empty string when there is nothing to share, so the caller can
 * leave the button disabled rather than opening a share sheet onto nothing.
 */
export function standingsText({ leagueName, caption, rows, limit = DEFAULT_LIMIT }: StandingsTextInput): string {
  if (!rows.length) return '';

  const shown = rows.slice(0, Math.max(1, limit));
  const scoreCols = Math.max(...shown.map((r) => displayWidth(r.shown)));
  const rankCols = Math.max(2, ...shown.map((r) => String(r.rank).length));
  // The arrow carries the direction and the number after it is how far; flat movement says nothing.
  const move = (r: StandingsRow) => (r.movementDir === 'flat' ? '' : r.movement.replace(/\s+/g, ''));
  const moveCols = Math.max(0, ...shown.map((r) => displayWidth(move(r))));

  // The name takes whatever the fixed columns leave, so the longest line lands on the budget
  // instead of near it. Two spaces between each column, and the movement column only if used.
  const fixed = rankCols + 2 + 2 + scoreCols + (moveCols ? 2 + moveCols : 0);
  const nameCols = Math.max(6, LINE_WIDTH - fixed);

  const lines = shown.map((r) => {
    const parts = [padStartTo(String(r.rank), rankCols), padTo(fitName(r.name, nameCols), nameCols), padStartTo(r.shown, scoreCols)];
    if (moveCols) parts.push(move(r));
    return parts.join('  ').trimEnd();
  });

  const rest = rows.length - shown.length;
  // The heading obeys the same budget. A league called something enormous would otherwise be the
  // one line that wraps, and it is the first thing anybody reads.
  // Uppercase first, then measure. German ß becomes SS and ﬁ becomes FI, so a heading measured
  // before the change can be a column or two over the budget by the time it is written.
  const head = [leagueName, caption].map((t) => fitName(t.toUpperCase(), LINE_WIDTH)).filter(Boolean);

  return [...head, '', ...lines, ...(rest > 0 ? ['', `+${rest} more`] : [])].join('\n');
}
