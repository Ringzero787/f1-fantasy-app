/**
 * Who Pit Wall would ace, for the Team screen and the driver sheet (F-119).
 *
 * The portal's Briefing has said this since F-097: the ace doubles points, so it belongs on the
 * highest projection among the picks allowed to carry it. The app showed a pass holder the
 * projection on each driver and left them to work the comparison out across five sheets — and on
 * the Team screen said only that no ace was set.
 *
 * The same rule as `briefRecs` in web/pitwall/src/data/logic.ts, so the two surfaces cannot give
 * different advice: drivers only, and only those the caller says may carry the ace. The caller
 * decides eligibility (the tile already knows the cap), so this can never name a driver the save
 * would refuse.
 *
 * Pure. Nothing here decides who may see it: without a pass there are no projections to pass in.
 */
import type { Projection } from './projections';

export interface AceCandidate {
  id: string;
  name: string;
  /** the picker and the server would accept the ace on this driver */
  eligible: boolean;
}

export type AceAdvice =
  /** no ace chosen: put it here */
  | { kind: 'set'; id: string; name: string; med: number }
  /** the ace is on a lower projection: `gain` is the difference before doubling, null when the current ace has no projection */
  | { kind: 'move'; id: string; name: string; med: number; gain: number | null }
  /** the ace is already on the best eligible driver: `lead` over the next best, null when there is no other */
  | { kind: 'keep'; id: string; name: string; med: number; lead: number | null };

const medOf = (byId: Record<string, Projection>, id: string | null): number | null => {
  const p = id ? byId[id] : undefined;
  return p && p.med > 0 ? p.med : null;
};

/**
 * The advice for a lineup, or null when there is nothing to reason from: no eligible driver has a
 * projection. `aceId` may be a constructor; it is compared on its own projection but never offered.
 */
export function aceAdvice(drivers: AceCandidate[], aceId: string | null, byId: Record<string, Projection>): AceAdvice | null {
  const ranked = drivers
    .filter((d) => d.eligible)
    .map((d) => ({ id: d.id, name: d.name, med: medOf(byId, d.id) }))
    .filter((d): d is { id: string; name: string; med: number } => d.med != null)
    // Ties go to the id so the advice does not move between renders.
    .sort((a, b) => b.med - a.med || a.id.localeCompare(b.id));
  if (ranked.length === 0) return null;
  const best = ranked[0];
  if (!aceId) return { kind: 'set', ...best };

  const aceMed = medOf(byId, aceId);
  const holder = ranked.find((d) => d.id === aceId);
  // Level with the best is a keep: moving the ace for no projected gain is churn, not advice.
  if (holder && holder.med >= best.med) {
    const next = ranked.find((d) => d.id !== aceId);
    return { kind: 'keep', ...holder, lead: next ? holder.med - next.med : null };
  }
  if (aceMed != null && aceMed >= best.med) return null; // a constructor ace out-projecting every driver: nothing to add
  return { kind: 'move', ...best, gain: aceMed != null ? best.med - aceMed : null };
}

const up = (s: string) => s.toUpperCase();
const pts = (n: number) => `${Math.round(n)}`;

/** One line for the Team screen, under the ace status. */
export function aceAdviceLine(a: AceAdvice): string {
  if (a.kind === 'set') return `ACE ${up(a.name)} · PROJECTS ${pts(a.med)}, ${pts(a.med * 2)} DOUBLED`;
  if (a.kind === 'move') return a.gain != null ? `MOVE THE ACE TO ${up(a.name)} · +${pts(a.gain)} BEFORE DOUBLING` : `MOVE THE ACE TO ${up(a.name)} · PROJECTS ${pts(a.med)}`;
  return a.lead != null && a.lead > 0 ? `KEEP THE ACE ON ${up(a.name)} · ${pts(a.lead)} CLEAR OF YOUR NEXT BEST` : `KEEP THE ACE ON ${up(a.name)}`;
}

export interface AceVerdict {
  /** this is the driver Pit Wall would ace */
  pick: boolean;
  text: string;
}

/**
 * What the sheet says about acing the driver it is showing. Null when there is no advice, or this
 * driver has no projection to compare. `eligible` is the tile's own answer on the ace cap.
 */
export function aceVerdictFor(id: string, eligible: boolean, a: AceAdvice | null, byId: Record<string, Projection>): AceVerdict | null {
  if (!a) return null;
  if (a.id === id) {
    return { pick: true, text: a.kind === 'keep' ? 'KEEP THE ACE HERE · YOUR HIGHEST PROJECTION THAT CAN CARRY IT' : 'ACE THIS DRIVER · YOUR HIGHEST PROJECTION THAT CAN CARRY IT' };
  }
  // Over the cap, a higher projection is beside the point: say why it is not them.
  if (!eligible) return { pick: false, text: `CANNOT CARRY THE ACE · IT GOES ON ${up(a.name)}` };
  const med = medOf(byId, id);
  if (med == null) return null;
  const behind = a.med - med;
  return { pick: false, text: behind > 0 ? `NOT THIS ONE · ${up(a.name)} PROJECTS ${pts(behind)} MORE` : `NOT THIS ONE · THE ACE GOES ON ${up(a.name)}` };
}
