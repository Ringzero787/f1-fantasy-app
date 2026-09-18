/**
 * Contract dots on a tile: one dot per race of the contract, filled while
 * the race is still ahead, hollow (borderStrong) once used, red when the
 * pick is in its final race.
 */
export type DotState = 'on' | 'off' | 'last';

export interface ContractDots {
  length: number;
  left: number;
  critical: boolean;
  dots: DotState[];
}

export function contractDots(contractLength: number | undefined, racesHeld: number | undefined, fallbackLength = 3): ContractDots {
  const length = Math.max(1, Math.round(contractLength ?? fallbackLength));
  const held = Math.max(0, Math.round(racesHeld ?? 0));
  const left = Math.max(0, length - held);
  const critical = left === 1;
  const dots: DotState[] = Array.from({ length }, (_, i) =>
    i < left ? (critical ? 'last' : 'on') : 'off',
  );
  return { length, left, critical, dots };
}
