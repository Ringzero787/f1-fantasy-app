/**
 * The `projections` job (F-070): read our own game data, simulate the next round, publish the
 * portal payloads. Inputs are limited to the closed list in model/inputs.ts (ADR-001) and the
 * scoring comes from functions/src/scoring/scoringCore.ts, so a projection cannot drift from
 * real scoring.
 *
 * Writes (Admin SDK only, rules deny every client):
 *   pw_pages/{season}_{round}     full payload, read with the pass claim
 *   pw_public/{season}_{round}    the free look
 *   pw_projections/{season}_{round}_{sessionKey}  one snapshot per refresh, for the movement chart
 */
import { assertAllowedInputs } from '../model/inputs';
import { pointsToRise } from '../model/priceRules';
import { scoreWeekend } from '../model/scoreRace';
import { buildPayload, type ConstructorMeta, type DriverMeta, type RoundMeta } from '../model/payload';
import { DEFAULT_SIM, simulate, type SimOptions } from '../model/simulate';
import { estimateForm, type Entrant } from '../model/strength';
import type { HistRace, History, Projection } from '../model/types';

/**
 * The slice of the Admin SDK this job uses, typed structurally so the package keeps no
 * firebase-admin dependency (the CLI and the service pass the real Firestore in).
 */
interface Snap { id: string; data(): Record<string, unknown> }
interface Query { where(field: string, op: string, value: unknown): Query; get(): Promise<{ docs: Snap[] }> }
interface Col extends Query { doc(id: string): { set(data: Record<string, unknown>): Promise<unknown> } }
export interface Db { collection(name: string): Col }
const toDate = (v: unknown): Date | null => (v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : null);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export interface ProjectionRun {
  season: string;
  round: number;
  raceId: string;
  sessionKey: string;
  projections: Projection[];
  wrote: string[];
  counts: { drivers: number; constructors: number; pastRaces: number };
}

/** Everything the job reads, in one place, so the input list can be asserted. */
export async function loadProjectionInputs(db: Db, season: string) {
  assertAllowedInputs(['races', 'raceScores', 'priceHistory', 'drivers', 'constructors']);
  const [racesSnap, scoresSnap, driversSnap, ctorsSnap] = await Promise.all([
    db.collection('races').where('seasonId', '==', season).get(),
    db.collection('raceScores').get(),
    db.collection('drivers').get(),
    db.collection('constructors').get(),
  ]);
  const races = racesSnap.docs.map((d: Snap) => ({ id: d.id, ...d.data() }) as Record<string, any>);
  const completed: HistRace[] = races
    .filter((r: Record<string, any>) => r.status === 'completed' && Array.isArray(r.results?.raceResults) && r.results.raceResults.length > 0)
    .map((r: Record<string, any>) => ({
      id: r.id, season: String(r.seasonId), round: num(r.round), hasSprint: Array.isArray(r.results.sprintResults) && r.results.sprintResults.length > 0,
      totalLaps: num(r.totalLaps) || r.results.raceResults.reduce((m: number, x: Record<string, unknown>) => (x.status === 'finished' ? Math.max(m, num(x.laps)) : m), 0),
      raceResults: r.results.raceResults, qualifyingResults: r.results.qualifyingResults ?? [], sprintResults: r.results.sprintResults ?? [],
    }))
    .sort((a: HistRace, b: HistRace) => a.round - b.round);
  const byRound = (a: Record<string, any>, b: Record<string, any>) => num(a.round) - num(b.round);
  // The round being run is still the round people are deciding about: a weekend flips to
  // `in_progress` at the first session, days before it is scored, and jumping to the next race then
  // would abandon the one everyone is looking at. So the current round is the one in progress, and
  // only when there is none does it become the next upcoming one.
  const running = races.filter((r: Record<string, any>) => r.status === 'in_progress').sort(byRound);
  const upcoming = [...running, ...races.filter((r: Record<string, any>) => r.status === 'upcoming').sort(byRound)];
  const drivers: DriverMeta[] = driversSnap.docs.map((d: Snap) => { const x = d.data(); return { id: d.id, number: num(x.number), name: String(x.name ?? d.id), constructorId: String(x.constructorId ?? ''), price: num(x.price), isActive: x.isActive !== false }; });
  const constructors: ConstructorMeta[] = ctorsSnap.docs.map((d: Snap) => { const x = d.data(); return { id: d.id, name: String(x.name ?? d.id), price: num(x.price), colors: x.colors as ConstructorMeta['colors'] }; });
  const history: History = { races: completed, scores: scoresSnap.docs.map((d: Snap) => d.data() as never), prices: [] };
  return { history, upcoming, drivers, constructors };
}

export interface ProjectOptions { season: string; sessionKey: string; sim?: Partial<SimOptions>; apply: boolean; now?: Date }

export async function runProjections(db: Db, opts: ProjectOptions): Promise<ProjectionRun> {
  const { history, upcoming, drivers, constructors } = await loadProjectionInputs(db, opts.season);
  const next = upcoming[0];
  if (!next) throw new Error(`no round in progress or upcoming in season ${opts.season}`);
  const round = num(next.round);
  const active = drivers.filter((d) => d.isActive && d.constructorId);
  if (active.length === 0) throw new Error('no active drivers');

  // Entrants for the next round: the active grid. Form comes from every completed race.
  const entrants: Entrant[] = active.map((d) => ({ driverId: d.id, constructorId: d.constructorId }));
  const form = estimateForm(history.races, entrants);
  const prices = new Map<string, number>([...drivers.map((d) => [d.id, d.price] as [string, number]), ...constructors.map((c) => [c.id, c.price] as [string, number])]);
  const lastRace = history.races[history.races.length - 1];
  const projections = simulate(form, {
    totalLaps: lastRace ? lastRace.totalLaps : 57,
    round,
    hasSprint: next.hasSprint === true,
    prices,
  }, { ...DEFAULT_SIM, ...opts.sim });

  // Pricing points per entity per past race, re-scored with the real rule, so the price direction the
  // portal shows is the blended one the backtest measured.
  const pricingHistory = new Map<string, number[]>();
  for (const race of history.races) {
    const scored = scoreWeekend(race.raceResults, race.qualifyingResults, race.sprintResults, { totalLaps: race.totalLaps, round: race.round });
    for (const [id, pts] of scored.pricingPoints) {
      const arr = pricingHistory.get(id) ?? [];
      arr.push(pts);
      pricingHistory.set(id, arr);
    }
  }

  // per-driver points per completed round, oldest first
  const byEntity = new Map<string, number[]>();
  const order = new Map(history.races.map((r, i) => [r.id, i]));
  const rows = history.scores.filter((s) => order.has(s.raceId)).sort((a, b) => (order.get(a.raceId) ?? 0) - (order.get(b.raceId) ?? 0));
  for (const s of rows) { const arr = byEntity.get(s.entityId) ?? []; arr.push(s.totalPoints); byEntity.set(s.entityId, arr); }

  const schedule = (next.schedule ?? {}) as Record<string, unknown>;
  const roundMeta: RoundMeta = {
    season: opts.season, round, raceId: String(next.id), name: String(next.name ?? ''), city: String(next.city ?? next.country ?? ''),
    circuit: String(next.circuitName ?? next.circuitId ?? ''), firstSession: toDate(schedule.fp1), hasSprint: next.hasSprint === true,
    lockAt: next.hasSprint === true ? toDate(schedule.sprintQualifying) ?? toDate(schedule.qualifying) : toDate(schedule.fp3) ?? toDate(schedule.qualifying),
  };
  const nextRounds = upcoming.slice(0, 6).map((r: Record<string, any>) => ({ round: num(r.round), label: String(r.circuitId ?? r.city ?? r.id).slice(0, 3).toUpperCase(), hasSprint: r.hasSprint === true }));
  // What a pick has to score to be worth its price. Undercut has no neutral band: below this it falls.
  const priceImplied = pointsToRise;
  const { full, free } = buildPayload({ round: roundMeta, nextRounds, drivers, constructors, projections, form: byEntity, ownership: new Map(), priceImplied, pricingHistory, asOf: opts.now ?? new Date(), budget: 1000 });

  const id = `${opts.season}_${round}`;
  const wrote: string[] = [];
  if (opts.apply) {
    await db.collection('pw_pages').doc(id).set(full);
    await db.collection('pw_public').doc(id).set(free);
    await db.collection('pw_projections').doc(`${id}_${opts.sessionKey}`).set({ season: opts.season, round, sessionKey: opts.sessionKey, asOf: full.asOf, projections: projections.map((p) => ({ ...p })) });
    wrote.push(`pw_pages/${id}`, `pw_public/${id}`, `pw_projections/${id}_${opts.sessionKey}`);
  }
  return { season: opts.season, round, raceId: roundMeta.raceId, sessionKey: opts.sessionKey, projections, wrote, counts: { drivers: full.drivers.length, constructors: full.constructors.length, pastRaces: history.races.length } };
}
