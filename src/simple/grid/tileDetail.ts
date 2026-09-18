/**
 * Tile detail sheet data — pure. Everything the sheet shows for one roster
 * entry, derived from the roster entry, live market price, the last scored
 * race and the entity's race history.
 */
import { estimateSaleQuote } from '../../utils/saleQuote';
import { contractDots, type ContractDots } from './contractDots';
import { trendOf, type TrendInfo } from './tileState';

export interface DetailEntry {
  id: string;
  name: string;
  purchasePrice: number;
  currentPrice: number;
  pointsScored?: number;
  racesHeld?: number;
  contractLength?: number;
  isReservePick?: boolean;
}

export interface DetailScore {
  round: number;
  raceId: string;
  totalPoints: number;
  racePoints?: number;
  qualiPoints?: number;
  sprintPoints?: number;
  position?: number | null;
  gridPosition?: number | null;
  positionsGained?: number;
  fastestLap?: boolean;
  status?: string;
}

export interface TileDetail {
  seasonPoints: number;
  perRace: number | null;          // points per race held
  price: number;                   // live market price
  paid: number;
  priceDelta: number;              // price − paid
  contract: ContractDots;
  trend: TrendInfo;
  lastRace: null | {
    total: number;
    parts: { label: string; value: string }[];
  };
  form: { round: number; points: number }[];   // last five scored rounds, oldest first
  aceEligible: boolean;
  sale: { marketPrice: number; fee: number; saleReturn: number; feeWaived: boolean };
}

function ordinal(n: number): string {
  return `P${n}`;
}

export function tileDetail(
  entry: DetailEntry,
  opts: {
    marketPrice?: number;
    last?: DetailScore | null;
    prev?: DetailScore | null;
    history?: DetailScore[];
    defaultContract: number;
    aceMaxPrice: number;
  },
): TileDetail {
  const price = opts.marketPrice ?? entry.currentPrice ?? entry.purchasePrice ?? 0;
  const paid = entry.purchasePrice ?? price;
  const held = Math.max(0, entry.racesHeld ?? 0);
  const seasonPoints = entry.pointsScored ?? 0;
  const q = estimateSaleQuote({ currentPrice: price, contractLength: entry.contractLength, racesHeld: entry.racesHeld, isReservePick: entry.isReservePick }, price);

  let lastRace: TileDetail['lastRace'] = null;
  const l = opts.last;
  if (l) {
    const parts: { label: string; value: string }[] = [];
    if (l.position != null) parts.push({ label: 'FINISH', value: ordinal(l.position) });
    else if (l.status) parts.push({ label: 'FINISH', value: l.status.toUpperCase().slice(0, 6) });
    if (l.gridPosition != null) parts.push({ label: 'GRID', value: ordinal(l.gridPosition) });
    if (l.racePoints != null) parts.push({ label: 'RACE', value: String(l.racePoints) });
    if (l.qualiPoints) parts.push({ label: 'QUALI', value: String(l.qualiPoints) });
    if (l.sprintPoints) parts.push({ label: 'SPRINT', value: String(l.sprintPoints) });
    if (l.positionsGained) parts.push({ label: 'GAINED', value: `${l.positionsGained > 0 ? '+' : ''}${l.positionsGained}` });
    if (l.fastestLap) parts.push({ label: 'FASTEST LAP', value: '✓' });
    lastRace = { total: l.totalPoints, parts };
  }

  const form = (opts.history ?? [])
    .slice()
    .sort((a, b) => a.round - b.round)
    .slice(-5)
    .map((h) => ({ round: h.round, points: h.totalPoints }));

  return {
    seasonPoints,
    perRace: held > 0 ? Math.round((seasonPoints / held) * 10) / 10 : null,
    price,
    paid,
    priceDelta: price - paid,
    contract: contractDots(entry.contractLength, entry.racesHeld, opts.defaultContract),
    trend: trendOf(opts.last?.totalPoints, opts.prev?.totalPoints),
    lastRace,
    form,
    aceEligible: price <= opts.aceMaxPrice,
    sale: { marketPrice: q.marketPrice, fee: q.earlyTermFee, saleReturn: q.saleReturn, feeWaived: q.feeWaived },
  };
}
