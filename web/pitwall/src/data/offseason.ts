/**
 * F-155: the portal's off-season state. From the day of the season rollover (F-150), when
 * `config/app.currentSeason` moves past the season this build reads (`SEASON` in lib/env.ts), every
 * team has been reset for the next season while the published payload is still last season's final
 * round: its projections, lineup advice and league line would be advice for teams that no longer
 * exist. So the portal shows this state instead, until a build reading the new season (F-158 moves
 * SEASON and the worker's PW_SEASON) is deployed — no deploy is needed on the rollover day itself.
 */
export interface Opener { name: string; raceMs: number | null }
export interface OffSeason { ended: string; next: string; opener: Opener | null }

const SEASON_ID = /^\d{4}$/;

/** Off-season when the server's current season is a later year than the portal's. Junk or absent: not. */
export function offSeason(currentSeason: unknown, portalSeason: string, opener: Opener | null = null): OffSeason | null {
  if (typeof currentSeason !== 'string' || !SEASON_ID.test(currentSeason) || !SEASON_ID.test(portalSeason)) return null;
  return Number(currentSeason) > Number(portalSeason) ? { ended: portalSeason, next: currentSeason, opener } : null;
}

/** "Australia on 14 March 2027", or the season alone when the calendar is not readable. */
export function openerLine(o: OffSeason): string {
  if (!o.opener) return `the ${o.next} season`;
  const day = o.opener.raceMs !== null && Number.isFinite(o.opener.raceMs)
    ? new Date(o.opener.raceMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : null;
  return day ? `${o.opener.name} on ${day}` : o.opener.name;
}

export function offSeasonText(o: OffSeason): { title: string; body: string } {
  return {
    title: `The ${o.ended} season is over`,
    body: `Every team has started fresh for ${o.next} in the app, so ${o.ended}'s projections and lineup advice are switched off here. `
      + `Pit Wall comes back with ${o.next} projections before the first round: ${openerLine(o)}.`,
  };
}
