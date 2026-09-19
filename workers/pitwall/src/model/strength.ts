/**
 * Form estimates from classifications only: where a driver is expected to
 * qualify and finish, how much that varies, and how often the car retires.
 * Recent races count more; thin data is pulled towards the car (teammates
 * share a car) and the car towards the middle of the grid.
 */
import type { HistRace } from './types';

export interface Entrant { driverId: string; constructorId: string }
export interface DriverForm extends Entrant { raceMu: number; qualiMu: number; dnfHazard: number; n: number }
export interface Form { drivers: DriverForm[]; sd: number; gridDnfRate: number }

export interface FormOptions {
  /** weight multiplier per race of age (0.85: a race five rounds ago counts 44%) */
  decay: number;
  /** pseudo-races of the car's average blended into a driver */
  carPrior: number;
  /** pseudo-races of mid-grid blended into a car */
  gridPrior: number;
  /** pseudo-races of the grid DNF rate blended into a driver's hazard */
  hazardPrior: number;
}
export const DEFAULT_FORM: FormOptions = { decay: 0.85, carPrior: 2, gridPrior: 1, hazardPrior: 6 };

interface Acc { w: number; race: number; raceW: number; quali: number; qualiW: number; dnf: number; starts: number }
const acc = (): Acc => ({ w: 0, race: 0, raceW: 0, quali: 0, qualiW: 0, dnf: 0, starts: 0 });

export function estimateForm(past: HistRace[], entrants: Entrant[], opts: FormOptions = DEFAULT_FORM): Form {
  const byDriver = new Map<string, Acc>();
  const byCar = new Map<string, Acc>();
  const grid = acc();
  const resid: Array<{ w: number; driverId: string; pos: number }> = [];
  const ordered = [...past].sort((a, b) => a.round - b.round);
  ordered.forEach((race, i) => {
    const w = opts.decay ** (ordered.length - 1 - i);
    const quali = new Map(race.qualifyingResults.map((q) => [q.driverId, q.position]));
    for (const r of race.raceResults) {
      if (r.status === 'dns') continue;
      const d = byDriver.get(r.driverId) ?? acc(); byDriver.set(r.driverId, d);
      const c = byCar.get(r.constructorId) ?? acc(); byCar.set(r.constructorId, c);
      for (const a of [d, c, grid]) {
        a.starts += w;
        if (r.status === 'dnf' || r.status === 'dsq') a.dnf += w;
        if (r.status === 'finished' && r.position >= 1) { a.race += w * r.position; a.raceW += w; }
        const q = quali.get(r.driverId);
        if (q) { a.quali += w * q; a.qualiW += w; }
      }
      if (r.status === 'finished' && r.position >= 1) resid.push({ w, driverId: r.driverId, pos: r.position });
    }
  });

  const mid = (entrants.length + 1) / 2;
  const gridDnfRate = grid.starts > 0 ? grid.dnf / grid.starts : 0.1;
  const carMean = (car: string, key: 'race' | 'quali'): number => {
    const c = byCar.get(car);
    const sum = c ? c[key] : 0;
    const w = c ? (key === 'race' ? c.raceW : c.qualiW) : 0;
    return (sum + opts.gridPrior * mid) / (w + opts.gridPrior);
  };
  const drivers: DriverForm[] = entrants.map((e) => {
    const d = byDriver.get(e.driverId) ?? acc();
    return {
      ...e,
      raceMu: (d.race + opts.carPrior * carMean(e.constructorId, 'race')) / (d.raceW + opts.carPrior),
      qualiMu: (d.quali + opts.carPrior * carMean(e.constructorId, 'quali')) / (d.qualiW + opts.carPrior),
      dnfHazard: (d.dnf + opts.hazardPrior * gridDnfRate) / (d.starts + opts.hazardPrior),
      n: d.starts,
    };
  });

  // pooled spread of finishing positions around each driver's own average
  const mu = new Map(drivers.map((d) => [d.driverId, d.raceMu]));
  let num = 0, den = 0;
  for (const r of resid) {
    const m = mu.get(r.driverId);
    if (m === undefined) continue;
    num += r.w * (r.pos - m) ** 2; den += r.w;
  }
  const sd = Math.max(2.5, den > 0 ? Math.sqrt(num / den) : 4);
  return { drivers, sd, gridDnfRate };
}
