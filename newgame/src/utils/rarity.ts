// Weighted random helpers used by the initial roll and shop refresh.

export function pickWeighted<T>(items: T[], weightFn: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  if (total <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }
  let r = Math.random() * total;
  for (const item of items) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

export function pickN<T>(items: T[], n: number, weightFn: (item: T) => number): T[] {
  const pool = [...items];
  const picked: T[] = [];
  while (picked.length < n && pool.length > 0) {
    const choice = pickWeighted(pool, weightFn);
    picked.push(choice);
    pool.splice(pool.indexOf(choice), 1);
  }
  return picked;
}

// Initial roll spread: a balanced garage that gives the new player meaningful choices.
// We skew toward 1 A-tier headliner + 2 B-tier mid-pack + 1 C-tier underdog,
// but allow some randomness in the count so two players' opening rolls feel different.
export function rollInitialDriverMix(rng: () => number = Math.random): {
  a: number;
  b: number;
  c: number;
} {
  // Roll a small variation in the spread so two new players don't always
  // get the same tier mix on day one.
  const variants: { a: number; b: number; c: number }[] = [
    { a: 1, b: 2, c: 1 },
    { a: 1, b: 1, c: 2 },
    { a: 2, b: 1, c: 1 },
    { a: 1, b: 3, c: 0 },
  ];
  return variants[Math.floor(rng() * variants.length)];
}
