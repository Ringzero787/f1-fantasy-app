/**
 * F-157: no year literal decides behaviour in src/ or app/. The season comes from
 * config/app.currentSeason through src/utils/season.ts; a year written into a screen goes stale the
 * day the season rolls over (2026's build would have created 2027 leagues as '2026').
 *
 * Scans every string, template, number and JSX text literal (comments are not literals, so dated
 * notes in comments are fine). A literal holding a year 2020–2039 fails, unless its file is:
 *   - demo, fixture or store-screenshot showcase data (by path, below), which may keep its year;
 *   - src/utils/season.ts, which holds the one documented last-resort season.
 * Add a path here only for data that never reaches a signed-in player's decisions.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const SCAN = ['src', 'app'];

/** Paths (relative, forward slashes) whose year literals are allowed. */
const EXCEPT: RegExp[] = [
  /(^|\/)__tests__\//,
  /\.test\.tsx?$/,
  /(^|\/)demo[^/]*$/i, // src/data/demoData.ts
  /[^/]*fixtures?[^/]*$/i,
  /(^|\/)showcase[^/]*$/i, // src/simple/grid/showcaseData.ts (EXPO_PUBLIC_SHOWCASE builds only)
  /^src\/utils\/season\.ts$/, // LAST_RESORT_SEASON_ID, the one documented constant
];

const YEAR_IN_TEXT = /(?<!\d)20[23]\d(?!\d)/;
const isYearNumber = (n: number) => Number.isInteger(n) && n >= 2020 && n <= 2039;

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...files(p)); }
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

/** Every year literal in one source text, as `line: text` (the first test pins what counts). */
function yearLiterals(fileName: string, text: string): string[] {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits: string[] = [];
  const hit = (node: ts.Node, s: string) => hits.push(`${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${s.trim().slice(0, 80)}`);
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      if (YEAR_IN_TEXT.test(node.text)) hit(node, node.text);
    } else if (ts.isNumericLiteral(node)) {
      if (isYearNumber(Number(node.text))) hit(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe('F-157 year literals', () => {
  it('the scanner catches quoted, numeric, template and JSX years and ignores comments', () => {
    const src = [
      "// 2026 in a comment is fine",
      "/* so is 2027 */",
      "const a = '2026';",
      "const b = findMeeting(2027, 'x');",
      "const c = `${x}_2026`;",
      "const d = <Text>2026 Season</Text>;",
      "const e = setTimeout(f, 2000);",
      "const g = '20260';",
    ].join('\n');
    expect(yearLiterals('x.tsx', src).map((h) => Number(h.split(':')[0]))).toEqual([3, 4, 5, 6]);
  });

  it('the exceptions are by path: demo, fixture, showcase and tests', () => {
    const ok = (p: string) => EXCEPT.some((r) => r.test(p));
    expect(ok('src/data/demoData.ts')).toBe(true);
    expect(ok('src/simple/grid/showcaseData.ts')).toBe(true);
    expect(ok('src/utils/season.ts')).toBe(true);
    expect(ok('src/store/league.store.ts')).toBe(false);
    expect(ok('app/(tabs)/index.tsx')).toBe(false);
  });

  it('no file in src/ or app/ outside the exceptions holds a year literal', () => {
    const found: string[] = [];
    for (const dir of SCAN) {
      for (const f of files(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        if (EXCEPT.some((r) => r.test(rel))) continue;
        for (const h of yearLiterals(f, fs.readFileSync(f, 'utf8'))) found.push(`${rel}:${h}`);
      }
    }
    expect(found).toEqual([]);
  });
});
