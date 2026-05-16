// Convert race points → in-game cash payout. Designed so a podium-quality
// race (~80 points) buys a mid-tier driver (~$60) and a poor race still
// pays out modestly.
//
// payout = base * (1 + min(points / 50, 2))
//   0 pts  → $5
//   25 pts → $7.5
//   50 pts → $10
//   100 pts → $15
//   150 pts → $20 (capped)

export function pointsToCash(points: number): number {
  const base = 5;
  const multiplier = Math.min(Math.max(points, 0) / 50, 2);
  return Math.round(base * (1 + multiplier));
}

// Streak bonus: +$3 per win streak race (consecutive races above league median),
// capped at $15. -$0 for loss streaks, but loss-streak relief comes via interest later.
export function streakBonus(winStreak: number): number {
  return Math.min(winStreak * 3, 15);
}

// Interest on saved cash held over a race weekend. 5% per race, capped at $20.
export function interestOnHeld(cashAtLockTime: number): number {
  return Math.min(Math.round(cashAtLockTime * 0.05), 20);
}
