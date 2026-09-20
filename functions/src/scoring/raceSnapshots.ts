/**
 * Per-race roster and Ace snapshots (F-029) — pure builders.
 *
 * A team document only holds its current roster and running totals. Each time
 * a phase of a race weekend (qualifying, sprint, race) is scored for a team,
 * calculatePoints writes `fantasyTeams/{teamId}/raceSnapshots/{raceId}` with
 * the roster as fielded and that phase's points, merged per phase. The weekend
 * total is derived by summing phases, so nothing is incremented and a repeated
 * scoring run (which the scoredRaces guard skips anyway) cannot double count.
 */

export type SnapshotPhase = 'qualifying' | 'sprint' | 'race';

interface RosterDriverIn {
  driverId: string;
  constructorId?: string;
  purchasePrice?: number;
  currentPrice?: number;
  contractLength?: number;
  racesHeld?: number;
  isReservePick?: boolean;
  pointsScored?: number;
}

interface RosterConstructorIn {
  constructorId: string;
  purchasePrice?: number;
  currentPrice?: number;
  contractLength?: number;
  racesHeld?: number;
  isReservePick?: boolean;
  pointsScored?: number;
}

export interface SnapshotTeamIn {
  userId?: string;
  leagueId?: string | null;
  drivers?: RosterDriverIn[];
  aceDriverId?: string;
  aceConstructorId?: string;
  budget?: number;
}

export interface SnapshotInput {
  teamId: string;
  team: SnapshotTeamIn;
  /** the roster's constructor BEFORE this phase was scored (own-property safe, see getTeamCtor) */
  constructorBefore: RosterConstructorIn | null;
  raceId: string;
  season: string | number | null | undefined;
  round: number | null | undefined;
  phase: SnapshotPhase;
  /** the team's points for this phase, exactly what was added to totalPoints */
  teamPoints: number;
  /** rosters after scoring: pointsScored deltas give the per-entity points */
  driversAfter: RosterDriverIn[];
  constructorAfter: RosterConstructorIn | null;
  scoredAt: unknown;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Points each roster entity earned in this phase: pointsScored after minus before. */
export function entityPhasePoints(
  before: RosterDriverIn[],
  after: RosterDriverIn[],
  ctorBefore: RosterConstructorIn | null,
  ctorAfter: RosterConstructorIn | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  const beforeById = new Map(before.map((d) => [d.driverId, num(d.pointsScored)]));
  for (const d of after) {
    if (!d || typeof d.driverId !== 'string') continue;
    out[d.driverId] = num(d.pointsScored) - (beforeById.get(d.driverId) ?? 0);
  }
  if (ctorAfter && typeof ctorAfter.constructorId === 'string') {
    const prior = ctorBefore && ctorBefore.constructorId === ctorAfter.constructorId ? num(ctorBefore.pointsScored) : 0;
    out[ctorAfter.constructorId] = num(ctorAfter.pointsScored) - prior;
  }
  return out;
}

/** The document to merge into `raceSnapshots/{raceId}` for one scored phase. */
export function buildRaceSnapshot(input: SnapshotInput): Record<string, unknown> {
  const { team, phase } = input;
  const before = Array.isArray(team.drivers) ? team.drivers : [];
  const entities = entityPhasePoints(before, input.driversAfter, input.constructorBefore, input.constructorAfter);
  const teamPoints = num(input.teamPoints);
  const entitySum = Object.values(entities).reduce((s, v) => s + v, 0);
  // Anything the team scored that no entity earned: the stale-roster penalty (race phase only).
  const adjustment = teamPoints - entitySum;
  const c = input.constructorBefore;
  return {
    teamId: input.teamId,
    userId: team.userId ?? null,
    leagueId: team.leagueId ?? null,
    raceId: input.raceId,
    season: input.season == null ? null : String(input.season),
    round: typeof input.round === 'number' ? input.round : null,
    roster: {
      drivers: before.map((d) => ({
        driverId: d.driverId,
        constructorId: d.constructorId ?? null,
        purchasePrice: num(d.purchasePrice),
        currentPrice: num(d.currentPrice),
        contractLength: typeof d.contractLength === 'number' ? d.contractLength : null,
        racesHeld: num(d.racesHeld),
        isReservePick: d.isReservePick === true,
      })),
      constructor: c
        ? {
            constructorId: c.constructorId,
            purchasePrice: num(c.purchasePrice),
            currentPrice: num(c.currentPrice),
            contractLength: typeof c.contractLength === 'number' ? c.contractLength : null,
            racesHeld: num(c.racesHeld),
            isReservePick: c.isReservePick === true,
          }
        : null,
      aceDriverId: team.aceDriverId ?? null,
      aceConstructorId: team.aceConstructorId ?? null,
      budget: num(team.budget),
    },
    phases: {
      [phase]: {
        points: teamPoints,
        entities,
        ...(adjustment !== 0 ? { adjustment } : {}),
        scoredAt: input.scoredAt,
      },
    },
  };
}

/** Weekend total of a snapshot document: the sum of its phases. */
export function snapshotWeekendPoints(snapshot: { phases?: Record<string, { points?: unknown }> } | null | undefined): number {
  if (!snapshot || !snapshot.phases) return 0;
  return Object.values(snapshot.phases).reduce((s, p) => s + num(p?.points), 0);
}
