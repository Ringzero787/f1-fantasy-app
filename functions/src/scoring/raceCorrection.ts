/**
 * F-168: apply a corrected classification to a race that is already scored.
 *
 * Race scoring (onRaceCompleted) runs once per team: a team already in `scoredRaces` is skipped,
 * so when the stewards changed a result after approval nothing reached the teams. At Las Vegas
 * 2026 Hadjar's time penalty dropped him from 14th to 15th behind Lawson after the race had
 * scored, and 90 teams kept 2–5 points they had not earned.
 *
 * The correction does not re-score a team. Everything in a team's race points that does not
 * depend on the classification (the lock bonus, the stale-roster penalty, which picks were
 * fielded, whether the Ace was valid) is already in the team's `raceSnapshots/{raceId}`. So each
 * pick's points move by exactly (new neutral points − old neutral points) × the Ace factor, per
 * component (race, qualifying, sprint), into the phase that component was scored in. Prices are
 * not rewound: they are a market players have already traded on.
 *
 * Idempotent per team: a snapshot records the signature of the results it reflects
 * (`resultsSig`), and a team whose snapshot already carries the new signature is skipped. Each
 * team is corrected in its own transaction.
 */
import * as admin from 'firebase-admin';
import { ACE_MAX_PRICE, RaceResult, SprintResult, QualifyingResult } from './scoringCore';
import { buildRaceScoreRows, ScoreRow } from './raceScoreRows';

export interface RaceResultsDoc {
  raceResults?: RaceResult[];
  sprintResults?: SprintResult[];
  qualifyingResults?: QualifyingResult[];
  fastestLap?: string;
}

type Component = 'race' | 'quali' | 'sprint';
type PhaseName = 'race' | 'qualifying' | 'sprint';
export type EntityDelta = Record<Component, number>;

/** A stable signature of the parts of a results document that scoring reads. */
export function resultsSignature(r: RaceResultsDoc | null | undefined): string {
  const sortBy = <T extends { driverId: string }>(rows: T[] | undefined) => [...(rows || [])].sort((a, b) => a.driverId.localeCompare(b.driverId));
  const race = sortBy(r?.raceResults).map((x) => [x.driverId, x.constructorId, x.position, x.gridPosition, x.status, !!x.fastestLap, x.laps ?? null]);
  const quali = sortBy(r?.qualifyingResults).map((x) => [x.driverId, x.constructorId, x.position]);
  const sprint = sortBy(r?.sprintResults).map((x) => [x.driverId, x.position, x.status]);
  return JSON.stringify({ race, quali, sprint, fl: r?.fastestLap ?? null });
}

const rowPoints = (row: ScoreRow | undefined): EntityDelta =>
  row ? { race: row.racePoints || 0, quali: row.qualiPoints || 0, sprint: row.sprintPoints || 0 } : { race: 0, quali: 0, sprint: 0 };

/** Per entity, how each neutral component moved between two sets of rows. Only entities that moved. */
export function componentDeltas(oldRows: ScoreRow[], newRows: ScoreRow[]): Map<string, EntityDelta> {
  const byId = (rows: ScoreRow[]) => new Map(rows.map((r) => [r.entityId, r]));
  const before = byId(oldRows);
  const after = byId(newRows);
  const out = new Map<string, EntityDelta>();
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = rowPoints(before.get(id));
    const b = rowPoints(after.get(id));
    const d = { race: b.race - a.race, quali: b.quali - a.quali, sprint: b.sprint - a.sprint };
    if (d.race || d.quali || d.sprint) out.set(id, d);
  }
  return out;
}

/** The rows whose stored breakdown differs, keyed by entity id (to rewrite raceScores). */
export function changedRows(oldRows: ScoreRow[], newRows: ScoreRow[]): ScoreRow[] {
  const before = new Map(oldRows.map((r) => [r.entityId, JSON.stringify(r)]));
  return newRows.filter((r) => before.get(r.entityId) !== JSON.stringify(r));
}

interface SnapRosterEntry { driverId?: string; constructorId?: string; racesHeld?: number }
interface SnapPhase { entities?: Record<string, number>; points?: number; adjustment?: number }
export interface SnapshotLike {
  roster?: { drivers?: SnapRosterEntry[]; constructor?: SnapRosterEntry | null; aceDriverId?: string | null; aceConstructorId?: string | null };
  phases?: Partial<Record<PhaseName, SnapPhase>>;
  resultsSig?: string;
}
export interface TeamPick { driverId?: string; constructorId?: string; racesHeld?: number; pointsScored?: number; [k: string]: unknown }
export interface TeamLike {
  drivers?: TeamPick[];
  constructor?: TeamPick | null;
  totalPoints?: number;
  lockedPoints?: number;
}

export interface TeamCorrection {
  /** per pick: the points it gains (negative: loses) */
  entityDelta: Record<string, number>;
  /** per phase: the corrected entities map and phase points */
  phases: Partial<Record<PhaseName, { entities: Record<string, number>; points: number }>>;
  racePhaseDelta: number;
  /** onto totalPoints (picks still held on the same contract) */
  activeDelta: number;
  /** onto lockedPoints (picks sold or expired since, whose points were banked) */
  bankedDelta: number;
  drivers: TeamPick[];
  constructor: TeamPick | null;
  /** a pick needed an Ace decision with no pre-race price on record */
  aceUnknown: string[];
}

/** Which sessions were scored on their own, before the race (the race doc's qualifyingScored / sprintScored). */
export interface Standalone { quali: boolean; sprint: boolean }

/**
 * The phase a component was scored into for this team, or null when it never was. Scored on its
 * own: the snapshot's qualifying/sprint phase, and only for a pick that phase scored (a pick
 * bought between qualifying and the race got none). A team without that phase while the session
 * was scored on its own joined after it, and the race run gave it none either. Not scored on its
 * own: the race run folded it into the race phase for every team.
 */
function phaseFor(component: Component, snap: SnapshotLike, standalone: Standalone, pickId: string): PhaseName | null {
  if (component === 'race') return 'race';
  const phase: PhaseName = component === 'quali' ? 'qualifying' : 'sprint';
  const own = snap.phases?.[phase];
  if (own) return own.entities && pickId in own.entities ? phase : null;
  return standalone[component] ? null : 'race';
}

/**
 * Pure: one team's correction from its snapshot and current doc. `preRacePrice` is the market
 * price at scoring time (priceHistory previousPrice): live scoring refuses an Ace over the cap
 * at that price, so the factor here is decided by the same rule. Returns null when nothing moves.
 */
export function planTeamCorrection(
  snap: SnapshotLike,
  team: TeamLike,
  deltas: Map<string, EntityDelta>,
  preRacePrice: (entityId: string) => number | undefined,
  standalone: Standalone = { quali: false, sprint: false },
): TeamCorrection | null {
  // (a `constructor` key cannot default from `{}`: TypeScript reads Object's own constructor)
  const roster = snap.roster;
  const rosterCtor: SnapRosterEntry | null = roster && Object.prototype.hasOwnProperty.call(roster, 'constructor') ? roster.constructor ?? null : null;
  const aceDriverId = roster?.aceDriverId ?? null;
  const aceConstructorId = roster?.aceConstructorId ?? null;
  const picks: Array<{ id: string; kind: 'driver' | 'constructor'; held: number }> = [
    ...(roster?.drivers || []).filter((d) => d.driverId).map((d) => ({ id: d.driverId as string, kind: 'driver' as const, held: d.racesHeld || 0 })),
    ...(rosterCtor?.constructorId ? [{ id: rosterCtor.constructorId, kind: 'constructor' as const, held: rosterCtor.racesHeld || 0 }] : []),
  ];
  const out: TeamCorrection = { entityDelta: {}, phases: {}, racePhaseDelta: 0, activeDelta: 0, bankedDelta: 0, drivers: [...(team.drivers || [])], constructor: Object.prototype.hasOwnProperty.call(team, 'constructor') ? team.constructor ?? null : null, aceUnknown: [] };
  let moved = false;

  for (const pick of picks) {
    const d = deltas.get(pick.id);
    if (!d) continue;
    const isAce = pick.kind === 'driver' ? aceDriverId === pick.id : aceConstructorId === pick.id;
    let factor = 1;
    if (isAce) {
      const price = preRacePrice(pick.id);
      if (price === undefined) out.aceUnknown.push(pick.id);
      else if (price <= ACE_MAX_PRICE) factor = 2;
    }
    // constructors earn no sprint points
    const comps: Component[] = pick.kind === 'driver' ? ['race', 'quali', 'sprint'] : ['race', 'quali'];
    let pickDelta = 0;
    for (const c of comps) {
      if (!d[c]) continue;
      const phase = phaseFor(c, snap, standalone, pick.id);
      const stored = phase ? snap.phases?.[phase] : undefined;
      if (!phase || !stored) continue; // never scored into this team
      const amount = d[c] * factor;
      const p = out.phases[phase] ?? { entities: { ...(stored.entities || {}) }, points: stored.points || 0 };
      p.entities[pick.id] = (p.entities[pick.id] || 0) + amount;
      p.points += amount;
      out.phases[phase] = p;
      if (phase === 'race') out.racePhaseDelta += amount;
      pickDelta += amount;
    }
    if (!pickDelta) continue;
    moved = true;
    out.entityDelta[pick.id] = pickDelta;

    // Still held on the same contract → the points live in pointsScored and totalPoints. A pick
    // sold, expired or bought again since has had these points banked into lockedPoints.
    if (pick.kind === 'driver') {
      const i = out.drivers.findIndex((x) => x.driverId === pick.id);
      if (i >= 0 && (out.drivers[i].racesHeld || 0) >= pick.held + 1) {
        out.drivers[i] = { ...out.drivers[i], pointsScored: (out.drivers[i].pointsScored || 0) + pickDelta };
        out.activeDelta += pickDelta;
      } else {
        out.bankedDelta += pickDelta;
      }
    } else if (out.constructor && out.constructor.constructorId === pick.id && (out.constructor.racesHeld || 0) >= pick.held + 1) {
      out.constructor = { ...out.constructor, pointsScored: (out.constructor.pointsScored || 0) + pickDelta };
      out.activeDelta += pickDelta;
    } else {
      out.bankedDelta += pickDelta;
    }
  }
  return moved ? out : null;
}

export interface CorrectionSummary {
  raceId: string;
  changed: boolean;
  refused?: string;
  newSig: string;
  rows: number;
  entityDeltas: Record<string, EntityDelta>;
  teams: Array<{ teamId: string; leagueId: string | null; userId: string | null; racePhaseDelta: number; activeDelta: number; bankedDelta: number; entityDelta: Record<string, number> }>;
  skippedAlreadyCorrected: number;
  /** snapshot reflects results other than this event's "before" (an out-of-order or stale event) */
  skippedOutOfOrder: number;
  aceUnknown: Array<{ teamId: string; entityId: string }>;
  moonshotsToReview: string[];
  leaguesSynced: string[];
}

export interface ApplyOptions {
  dryRun: boolean;
  log?: (msg: string) => void;
  /** league standings sync (calculatePoints.syncLeaguesForRace); injected to keep this module free of the trigger file */
  syncLeagues?: (raceId: string, race: { season: string | number | null | undefined; round: number | null | undefined; name?: string | null }, updates: { leagueId: string; userId: string; points: number }[]) => Promise<string[]>;
}

/**
 * Apply a corrected classification to every team that fielded the race. `oldResults` is what the
 * teams were scored on, `newResults` the corrected classification. With dryRun nothing is written.
 */
export async function applyRaceCorrection(
  db: FirebaseFirestore.Firestore,
  raceId: string,
  race: { seasonId?: string | null; round?: number; totalLaps?: number; name?: string | null; qualifyingScored?: boolean; sprintScored?: boolean },
  oldResults: RaceResultsDoc,
  newResults: RaceResultsDoc,
  opts: ApplyOptions,
  /** the lap count the old results were scored with (the DNF penalty depends on it); defaults to race.totalLaps */
  oldTotalLaps?: number,
): Promise<CorrectionSummary> {
  const log = opts.log ?? ((m: string) => console.log(`[Correction] ${m}`));
  const ctx = (laps: number | undefined) => ({ raceId, seasonId: race.seasonId ?? null, round: race.round || 0, totalLaps: laps });
  const rowsOf = (r: RaceResultsDoc, laps: number | undefined) => buildRaceScoreRows(r.raceResults || [], r.sprintResults || null, r.qualifyingResults || null, ctx(laps));
  const oldRows = rowsOf(oldResults, oldTotalLaps ?? race.totalLaps);
  const newRows = rowsOf(newResults, race.totalLaps);
  const oldSig = resultsSignature(oldResults);
  const standalone: Standalone = { quali: race.qualifyingScored === true, sprint: race.sprintScored === true };
  const deltas = componentDeltas(oldRows, newRows);
  const rowsToWrite = changedRows(oldRows, newRows);
  const newSig = resultsSignature(newResults);
  const summary: CorrectionSummary = {
    raceId, changed: deltas.size > 0 || rowsToWrite.length > 0, newSig, rows: rowsToWrite.length,
    entityDeltas: Object.fromEntries(deltas), teams: [], skippedAlreadyCorrected: 0, skippedOutOfOrder: 0, aceUnknown: [], moonshotsToReview: [], leaguesSynced: [],
  };
  if (!summary.changed) { log(`${raceId}: the corrected results score the same; nothing to do`); return summary; }
  // An empty classification is a broken fetch or a manual edit, never a correction: applying it
  // would take every team's race points away.
  if (!(newResults.raceResults || []).length) {
    summary.refused = 'the new results have no race classification';
    log(`${raceId}: REFUSED — ${summary.refused}`);
    return summary;
  }

  // A later race of the same season already scored: lastRacePoints and the weekend leaderboard
  // now belong to it, and rewriting them for this race would be wrong. Refuse; that needs a person.
  if (race.seasonId != null && race.round) {
    const later = await db.collection('races').where('seasonId', '==', race.seasonId).where('status', '==', 'completed').get();
    const newer = later.docs.filter((d) => (d.data().round || 0) > (race.round || 0)).map((d) => d.id);
    if (newer.length) {
      summary.refused = `a later race has already scored (${newer.join(', ')})`;
      log(`${raceId}: REFUSED — ${summary.refused}`);
      return summary;
    }
  }

  // The Ace was checked against the market price at scoring time, which Phase 2 recorded as the
  // priceHistory row's previousPrice.
  const prices = new Map<string, number>();
  const hist = await db.collection('priceHistory').where('raceId', '==', raceId).get();
  hist.docs.forEach((h) => { const x = h.data(); if (typeof x.previousPrice === 'number') prices.set(x.entityId, x.previousPrice); });
  const preRacePrice = (id: string) => prices.get(id);

  const teamsSnap = await db.collection('fantasyTeams').get();
  const changedLeagues = new Set<string>();

  for (const teamDoc of teamsSnap.docs) {
    const snapRef = teamDoc.ref.collection('raceSnapshots').doc(raceId);
    const run = async (tx: FirebaseFirestore.Transaction | null) => {
      const [teamSnap, snapSnap] = tx ? await Promise.all([tx.get(teamDoc.ref), tx.get(snapRef)]) : [teamDoc, await snapRef.get()];
      if (!snapSnap.exists) return null;
      // set+mergeFields below would create a missing doc where update() failed: a team deleted after
      // the list was read (its snapshots outlive it) must not come back as a partial doc
      if (!teamSnap.exists) return null;
      const snap = snapSnap.data() as SnapshotLike;
      const team = (teamSnap.data() || {}) as TeamLike;
      if (snap.resultsSig === newSig) { summary.skippedAlreadyCorrected++; return null; }
      // The delta is (new − old) for THIS event's old results. A snapshot already moved to some
      // other version (an event delivered late or out of order) must not take it again on top.
      if (snap.resultsSig !== undefined && snap.resultsSig !== oldSig) { summary.skippedOutOfOrder++; return null; }
      const plan = planTeamCorrection(snap, team, deltas, preRacePrice, standalone);
      if (!tx) return plan;
      const now = admin.firestore.Timestamp.now();
      const snapUpdate: Record<string, unknown> = {
        resultsSig: newSig,
        corrections: admin.firestore.FieldValue.arrayUnion({ at: now, sig: hash(newSig), delta: plan ? plan.entityDelta : {} }),
      };
      if (plan) {
        for (const [phase, p] of Object.entries(plan.phases)) {
          snapUpdate[`phases.${phase}.entities`] = p!.entities;
          snapUpdate[`phases.${phase}.points`] = p!.points;
        }
        const teamUpdate: Record<string, unknown> = {
          drivers: plan.drivers,
          constructor: plan.constructor,
          totalPoints: (team.totalPoints || 0) + plan.activeDelta,
        };
        if (plan.bankedDelta) teamUpdate.lockedPoints = (team.lockedPoints || 0) + plan.bankedDelta;
        // set + mergeFields, NOT update(): update() expands keys as field paths and a top-level
        // `constructor` collides with Object.prototype.constructor ("Can't merge current value into a
        // nested object", thrown at commit; OP-239 hit it). mergeFields replaces each named field
        // whole, as update() would.
        tx.set(teamDoc.ref, teamUpdate, { mergeFields: Object.keys(teamUpdate) });
      }
      tx.update(snapRef, snapUpdate as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
      return plan;
    };
    const plan = opts.dryRun ? await run(null) : await db.runTransaction((tx) => run(tx));
    if (!plan) continue;
    const t = teamDoc.data();
    summary.teams.push({ teamId: teamDoc.id, leagueId: t.leagueId ?? null, userId: t.userId ?? null, racePhaseDelta: plan.racePhaseDelta, activeDelta: plan.activeDelta, bankedDelta: plan.bankedDelta, entityDelta: plan.entityDelta });
    plan.aceUnknown.forEach((e) => summary.aceUnknown.push({ teamId: teamDoc.id, entityId: e }));
    if (t.leagueId) changedLeagues.add(t.leagueId);
  }

  // A settled Moonshot was paid on the old classification. Settlement is its own ledger; list the
  // calls on drivers whose race result moved so a person can look, rather than re-settle blind.
  const movedDrivers = new Set([...deltas.entries()].filter(([, d]) => d.race !== 0).map(([id]) => id));
  const ms = await db.collection('moonshots').where('raceId', '==', raceId).get();
  ms.docs.forEach((m) => { const x = m.data(); if (x.settledAt && movedDrivers.has(x.driverId)) summary.moonshotsToReview.push(m.id); });

  if (opts.dryRun) {
    log(`${raceId}: DRY RUN — ${summary.teams.length} team(s) would change, ${rowsToWrite.length} raceScores row(s) would be rewritten`);
    return summary;
  }

  // raceScores rows: the corrected breakdown, so the app's per-pick numbers match the teams
  const batch = db.batch();
  for (const row of rowsToWrite) {
    batch.set(db.collection('raceScores').doc(`${raceId}__${row.entityId}`), { ...row, timestamp: admin.firestore.FieldValue.serverTimestamp() });
  }
  await batch.commit();

  // Best race: a team whose best was this race and went down may now have another best.
  for (const t of summary.teams) {
    if (t.racePhaseDelta === 0) continue;
    const ref = db.collection('fantasyTeams').doc(t.teamId);
    const cur = (await ref.get()).data() || {};
    const own = (await ref.collection('raceSnapshots').doc(raceId).get()).data() as SnapshotLike | undefined;
    const thisRace = own?.phases?.race?.points ?? 0;
    if (cur.bestRaceId === raceId && t.racePhaseDelta < 0) {
      const all = await ref.collection('raceSnapshots').get();
      let best = { id: raceId, pts: thisRace };
      all.docs.forEach((d) => { const p = (d.data() as SnapshotLike).phases?.race?.points; if (typeof p === 'number' && p > best.pts) best = { id: d.id, pts: p }; });
      await ref.update({ bestRacePoints: best.pts, bestRaceId: best.id });
    } else if (typeof cur.bestRacePoints !== 'number' || thisRace > cur.bestRacePoints) {
      await ref.update({ bestRacePoints: thisRace, bestRaceId: raceId });
    } else if (cur.bestRaceId === raceId) {
      await ref.update({ bestRacePoints: thisRace });
    }
  }

  // League standings for every league with a changed team: totals from the team docs, this
  // race's points from the (now corrected) snapshots of every team in those leagues.
  if (opts.syncLeagues && changedLeagues.size) {
    const updates: { leagueId: string; userId: string; points: number }[] = [];
    for (const teamDoc of teamsSnap.docs) {
      const t = teamDoc.data();
      if (!t.leagueId || !changedLeagues.has(t.leagueId) || !t.userId) continue;
      const s = (await teamDoc.ref.collection('raceSnapshots').doc(raceId).get()).data() as SnapshotLike | undefined;
      if (!s) continue;
      updates.push({ leagueId: t.leagueId, userId: t.userId, points: s.phases?.race?.points || 0 });
    }
    summary.leaguesSynced = await opts.syncLeagues(raceId, { season: race.seasonId, round: race.round, name: race.name ?? null }, updates);
  }

  log(`${raceId}: corrected ${summary.teams.length} team(s), ${rowsToWrite.length} raceScores row(s), ${summary.leaguesSynced.length} league(s)` +
    (summary.skippedOutOfOrder ? `; ${summary.skippedOutOfOrder} team(s) skipped: snapshot is on another results version (review)` : '') +
    (summary.moonshotsToReview.length ? `; settled Moonshots to review: ${summary.moonshotsToReview.join(', ')}` : '') +
    (summary.aceUnknown.length ? `; Ace without a pre-race price (scored ×1): ${summary.aceUnknown.map((a) => `${a.teamId}/${a.entityId}`).join(', ')}` : ''));
  return summary;
}

/** A short, stable id for a signature (the audit trail on the snapshot; the full signature is in resultsSig). */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
