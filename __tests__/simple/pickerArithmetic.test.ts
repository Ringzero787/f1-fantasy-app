import {
  cheapestCompletion, completionReserve, formatValue, leftoverCopy, leftoverLine, leftoverTight, pairingHints, valueOf,
} from '../../src/simple/grid/pickerArithmetic';

const row = (id: string, extra: Partial<{ constructorId: string; pts: number; price: number; selected: boolean; blocked: boolean }> = {}) => ({
  id, constructorId: extra.constructorId ?? 'apex', pts: extra.pts ?? 100, price: extra.price ?? 100,
  selected: extra.selected ?? false, blocked: extra.blocked ?? false,
});

describe('valueOf', () => {
  it('is points divided by price', () => {
    expect(valueOf(200, 100)).toBe(2);
    expect(formatValue(2)).toBe('2.00');
  });
  it('is null when price is not positive, so a free or missing price cannot look like infinite value', () => {
    expect(valueOf(200, 0)).toBeNull();
    expect(valueOf(200, -10)).toBeNull();
    expect(formatValue(null)).toBe('–');
  });
});

describe('leftover', () => {
  it('names the remaining seats and the cheapest fill', () => {
    expect(leftoverCopy(420, 3)).toBe('LEAVES $420 FOR 3 SLOTS');
    expect(leftoverCopy(80, 1)).toBe('LEAVES $80 FOR 1 SLOT');
    expect(leftoverCopy(420, 0)).toBeNull();
    expect(leftoverLine(420, 3, 180)).toBe('LEAVES $420 FOR 3 SLOTS · CHEAPEST FILL $180');
  });
  it('counts the constructor as a seat while none is picked', () => {
    // the owner read `LEAVES $65 FOR 1 SLOT`, spent the $65 on the driver and had no constructor
    expect(leftoverCopy(65, 1, true)).toBe('LEAVES $65 FOR 1 SLOT + CONSTRUCTOR');
    expect(leftoverCopy(65, 2, true)).toBe('LEAVES $65 FOR 2 SLOTS + CONSTRUCTOR');
    expect(leftoverCopy(65, 0, true)).toBe('LEAVES $65 FOR A CONSTRUCTOR');
    expect(leftoverCopy(65, 0, false)).toBeNull();
    expect(leftoverLine(65, 1, 25, true)).toBe('LEAVES $65 FOR 1 SLOT + CONSTRUCTOR · CHEAPEST FILL $25');
  });
  it('reserves the cheapest finish after a pick: the other seats at the lowest prices plus the constructor', () => {
    const open = [65, 40, 5, 10, 20];
    expect(completionReserve(65, open, 0, 20)).toBe(20);          // last seat, constructor still to pick
    expect(completionReserve(65, open, 1, 20)).toBe(25);          // one more seat at $5, plus the constructor
    expect(completionReserve(65, open, 2, 0)).toBe(15);           // two more seats, constructor already picked
    expect(completionReserve(5, open, 1, 0)).toBe(10);            // removes one instance of its own price
    expect(completionReserve(65, [65], 1, 20)).toBeNull();        // nobody left to fill the seat
    expect(completionReserve(65, open, -1, -3)).toBe(0);
  });
  it('sums the cheapest N prices, and is null when there are not enough', () => {
    expect(cheapestCompletion([90, 10, 40, 20], 3)).toBe(70);
    expect(cheapestCompletion([90, 10], 3)).toBeNull();
    expect(cheapestCompletion([90], 0)).toBe(0);
  });
  it('is tight when the leftover cannot cover the cheapest fill', () => {
    expect(leftoverTight(80, 180)).toBe(true);
    expect(leftoverTight(200, 180)).toBe(false);
    expect(leftoverTight(200, null)).toBe(false);
  });
});

describe('pairingHints', () => {
  it('says nothing before the first pick, and nothing once the list is full', () => {
    const market = [row('a'), row('b'), row('c')];
    expect(pairingHints(market, 1000, 5)).toEqual([]);
    expect(pairingHints([row('a', { selected: true }), row('b'), row('c')], 1000, 0)).toEqual([]);
  });
  it('marks a teammate, a row that still leaves enough, and cheap + scores, without repeating an id', () => {
    const hints = pairingHints([
      row('held', { constructorId: 'apex', selected: true, price: 400, pts: 400 }),
      row('mate', { constructorId: 'apex', price: 80, pts: 40 }),
      row('dear', { constructorId: 'scarlet', price: 200, pts: 50 }),
      row('cheap', { constructorId: 'navy', price: 20, pts: 60 }),
      row('mid', { constructorId: 'navy', price: 50, pts: 10 }),
    ], 300, 2);
    expect(hints.map((h) => h.kind)).toEqual(['teammate', 'leaves', 'cheap_scores']);
    expect(hints.find((h) => h.kind === 'teammate')?.id).toBe('mate');
    expect(hints.find((h) => h.kind === 'cheap_scores')?.id).toBe('cheap');
    expect(new Set(hints.map((h) => h.id)).size).toBe(hints.length);
  });
  it('keeps the constructor money out of the LEAVES row and says what the leftover is for', () => {
    // four picked, one seat open, $65 left, cheapest constructor $20: the $65 driver is no longer
    // the row that "leaves" anything; the $45 one is, and it leaves $20 for the constructor
    const rows = [
      row('held', { selected: true, constructorId: 'apex' }),
      row('dear', { constructorId: 'scarlet', price: 65, pts: 180 }),
      row('fits', { constructorId: 'navy', price: 45, pts: 120 }),
      row('cheap', { constructorId: 'navy', price: 5, pts: 83 }),
    ];
    expect(pairingHints(rows, 65, 1).find((h) => h.kind === 'leaves')).toEqual({ id: 'dear', kind: 'leaves', label: 'LEAVES $0' });
    expect(pairingHints(rows, 65, 1, 20).find((h) => h.kind === 'leaves')).toEqual({ id: 'fits', kind: 'leaves', label: 'LEAVES $20 FOR A CONSTRUCTOR' });
    // two seats open on $80: $45 + the $5 fill + the $20 constructor fits, $65 does not
    expect(pairingHints(rows, 80, 2, 20).find((h) => h.kind === 'leaves')).toEqual({ id: 'fits', kind: 'leaves', label: 'LEAVES $35 FOR 1 SLOT + CONSTRUCTOR' });
    expect(pairingHints(rows, 65, 2, 20).find((h) => h.kind === 'leaves')).toBeUndefined();
  });
  it('never hints a blocked or already selected row', () => {
    const hints = pairingHints([
      row('held', { selected: true, constructorId: 'apex' }),
      row('locked', { constructorId: 'apex', blocked: true, price: 10, pts: 90 }),
      row('ok', { constructorId: 'navy', price: 20, pts: 80 }),
    ], 500, 1);
    expect(hints.every((h) => h.id !== 'locked' && h.id !== 'held')).toBe(true);
  });
});
