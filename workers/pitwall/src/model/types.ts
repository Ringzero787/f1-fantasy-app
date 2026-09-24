/** History the projection model may read. See inputs.ts for why this list is closed. */
export interface HistRaceResult { driverId: string; constructorId: string; position: number; gridPosition: number; status: string; fastestLap?: boolean; laps?: number }
export interface HistQualiResult { driverId: string; constructorId: string; position: number }
export interface HistSprintResult { driverId: string; position: number; status: string }

export interface HistRace {
  id: string;
  season: string;
  round: number;
  hasSprint: boolean;
  totalLaps: number;
  raceResults: HistRaceResult[];
  qualifyingResults: HistQualiResult[];
  sprintResults: HistSprintResult[];
}

/** Neutral fantasy points per entity per race, as scoring wrote them (`raceScores`). */
export interface HistScore { raceId: string; round: number; entityId: string; entityType: 'driver' | 'constructor'; totalPoints: number }

/** One price move as scoring applied it (`priceHistory`). */
export interface HistPrice { raceId: string; entityId: string; entityType: 'driver' | 'constructor'; previousPrice: number; change: number }

export interface History { races: HistRace[]; scores: HistScore[]; prices: HistPrice[] }

export interface Projection {
  entityId: string;
  entityType: 'driver' | 'constructor';
  /** 15th percentile of the runs in which the entity finished; retirements are pDnf, reported separately */
  floor: number;
  median: number;
  /** 85th percentile of the finishing runs */
  ceiling: number;
  mean: number;
  pWin: number; pPodium: number; pTop10: number; pDnf: number;
  /** points if this pick is the Ace (doubled) */
  aceMedian: number;
  /** model probability the price rises / falls, and the simulation's expected change */
  pRise: number; pFall: number; expectedPriceChange: number;
  /**
   * The change the portal shows, blended with recent form. The rule keys off one race's position
   * points, which are noisy; the blend is what the backtest measures, so this is the number a
   * page may display. Filled in by the payload builder, which holds the history.
   */
  blendedPriceChange?: number;
}
