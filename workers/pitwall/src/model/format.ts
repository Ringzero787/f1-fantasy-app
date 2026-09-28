/** Rounding shared by the payload, the splits and the outlook, so three copies cannot drift. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;
