/**
 * A team as text you can paste anywhere (F-086).
 *
 * The league share answered "how is everyone doing". This answers "here is what I am running", which
 * is the other half of the same conversation: somebody posts their lineup and the group tells them
 * the ace is wrong.
 *
 * Same constraints as the standings share, for the same reasons, and the shared ones live in
 * `shareStandings` rather than being written twice:
 *
 * - No code fence. It would give Slack perfect monospace and give SMS and email three literal
 *   backticks, and two of the three destinations lose.
 * - Every line inside the same display-column budget, measured in columns rather than characters,
 *   because a name is whatever the player's account is called and the app ships in Japanese.
 * - Nothing that is not worth a line. A team of six fits on any screen; padding it with fields
 *   nobody reads is how it stops being readable.
 *
 * Pure, so it is tested without a React Native runtime.
 */
import { LINE_WIDTH, displayWidth, fitName, padStartTo, padTo } from './shareStandings';

export interface TeamShareDriver {
  name: string;
  /** points this driver has scored for the team */
  pts: number;
  ace: boolean;
}

export interface TeamShareInput {
  teamName: string;
  /** what is being shown, e.g. "AFTER ROUND 17" */
  caption: string;
  seasonPoints: number;
  /** null when the round has not been scored */
  lastRace: number | null;
  rank: number | null;
  leagueSize: number | null;
  drivers: TeamShareDriver[];
}

/** The ace scores double, which is the single most argued-about choice, so it is marked. */
const ACE = '2x';

export function teamText({ teamName, caption, seasonPoints, lastRace, rank, leagueSize, drivers }: TeamShareInput): string {
  if (!drivers.length) return '';

  const head = [teamName, caption].map((t) => fitName(t.toUpperCase(), LINE_WIDTH)).filter(Boolean);

  // The season total is the headline; last race and rank only earn their place when they exist.
  const summary: string[] = [`${seasonPoints.toLocaleString('en-US')} PTS`];
  if (lastRace !== null) summary.push(`${lastRace >= 0 ? '+' : ''}${lastRace} LAST`);
  if (rank !== null) summary.push(leagueSize ? `P${rank} OF ${leagueSize}` : `P${rank}`);

  const scoreCols = Math.max(...drivers.map((d) => displayWidth(String(d.pts))));
  const aceCols = drivers.some((d) => d.ace) ? ACE.length : 0;
  const nameCols = Math.max(6, LINE_WIDTH - (2 + scoreCols + (aceCols ? 2 + aceCols : 0)));

  const lines = drivers.map((d) => {
    const parts = [padTo(fitName(d.name, nameCols), nameCols), padStartTo(String(d.pts), scoreCols)];
    if (aceCols) parts.push(d.ace ? ACE : ' '.repeat(aceCols));
    return parts.join('  ').trimEnd();
  });

  return [...head, '', summary.join(' · '), '', ...lines].join('\n');
}
