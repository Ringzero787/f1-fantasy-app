/**
 * The call follows the car (F-110). When the driver a Moonshot was called on is not in the
 * classification and someone who is not one of that team's regular drivers drove the car, the
 * call is settled on that substitute's result — the owner's rule: "if there is a sub you pick the
 * car that driver was in and assume the new driver in that car". A regular team-mate is never
 * the substitute; with no substitute the called driver's own absence applies (the DNS rule).
 */

export interface SeatResult { driverId?: string; constructorId?: string; position?: number | null; status?: string | null }
export interface KnownDriver { id: string; constructorId?: string | null; isActive?: boolean }

/** The seat as it was when the call was confirmed: the car and the team's regular drivers then. */
export interface StampedSeat { constructorId: string | null; regulars: string[] }

export interface SeatResolution {
  /** the result the call settles on, or undefined when the driver is absent with no substitute */
  result: SeatResult | undefined;
  /** the substitute's id when the call followed the car */
  substituteId: string | null;
}

/**
 * Pure. `results` is the race classification; `drivers` the game's driver list (regular seats by
 * constructor) — read at settlement, so a permanent replacement must be added to `drivers` after
 * the race he first replaced someone in has been scored, or he counts as a regular, not a substitute. The substitute is the one row for the called driver's constructor whose driver is
 * neither the called driver nor another regular driver of that constructor.
 */
export function resolveSeat(driverId: string, results: SeatResult[], drivers: KnownDriver[], stamped?: StampedSeat | null): SeatResolution {
  const own = results.find((r) => r.driverId === driverId);
  // a driver who took part settles on his own result; one listed as DNS may have been replaced
  // in the car (the classification can carry both rows), so the seat is searched before his row counts
  if (own && own.status !== 'dns') return { result: own, substituteId: null };
  // the seat as stamped at confirm wins over today's roster: a driver moved or added since must not
  // turn a team-mate into a stranger, or a stand-in into a regular
  const seat = stamped?.constructorId ? stamped : seatOf(driverId, drivers);
  const constructorId = seat.constructorId;
  if (!constructorId) return { result: own, substituteId: null };
  const regulars = new Set(seat.regulars);
  const subs = results.filter((r) => r.constructorId === constructorId && r.driverId && !regulars.has(r.driverId));
  if (subs.length !== 1) return { result: own, substituteId: null };   // nobody, or more than one car's worth of strangers: no guess
  return { result: subs[0], substituteId: subs[0].driverId ?? null };
}

/** The car and the regular (active) drivers of the called driver's team, from the game's driver list. */
export function seatOf(driverId: string, drivers: KnownDriver[]): StampedSeat {
  const constructorId = drivers.find((d) => d.id === driverId)?.constructorId ?? null;
  if (!constructorId) return { constructorId: null, regulars: [] };
  return { constructorId, regulars: drivers.filter((d) => d.constructorId === constructorId && d.isActive !== false).map((d) => d.id) };
}
