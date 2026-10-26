/**
 * Race-day running score on the Team screen (F-129). The server sweep writes, each minute of the
 * race, what every driver and constructor would score for the race session at the current order
 * (`running` on `races/{raceId}/live/positions`). This module turns that into the roster's numbers:
 * one per tile, with the Ace doubled, and the sum for the stat row.
 *
 * It is a running score, not a result: qualifying and sprint points are already banked, the loyalty
 * lock bonus is added at settlement, and a retired car sits at the back of the order until the
 * official classification applies the real penalty. The labels say LIVE, never "points scored".
 */
import type { GridTile } from './tileState';
import type { LiveRunning } from './moonshot';

/** The tile's running race points, Ace doubled when the pick may be Ace; null for an open slot or a pick the sweep has not seen. */
export function tileLiveScore(tile: GridTile, running: LiveRunning | null): number | null {
  if (!running || tile.kind === 'empty') return null;
  const base = tile.kind === 'driver' ? running.drivers[tile.id] : running.constructors[tile.id];
  if (typeof base !== 'number' || !Number.isFinite(base)) return null;
  // the server refuses an Ace priced over the cap at scoring time; the tile already knows that as aceEligible
  return tile.ace && tile.aceEligible ? base * 2 : base;
}

/** The roster's running total; null until at least one pick has a number. */
export function rosterLiveScore(tiles: GridTile[], running: LiveRunning | null): number | null {
  let total = 0, any = false;
  for (const t of tiles) {
    const v = tileLiveScore(t, running);
    if (v == null) continue;
    total += v; any = true;
  }
  return any ? total : null;
}

/** "+34" / "-3" / "0", the way the stat row writes a race score. */
export function signedScore(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
