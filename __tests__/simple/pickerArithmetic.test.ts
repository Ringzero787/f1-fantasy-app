import {
  cheapestCompletion, formatValue, leftoverCopy, leftoverLine, leftoverTight, pairingHints, valueOf,
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
  it('never hints a blocked or already selected row', () => {
    const hints = pairingHints([
      row('held', { selected: true, constructorId: 'apex' }),
      row('locked', { constructorId: 'apex', blocked: true, price: 10, pts: 90 }),
      row('ok', { constructorId: 'navy', price: 20, pts: 80 }),
    ], 500, 1);
    expect(hints.every((h) => h.id !== 'locked' && h.id !== 'held')).toBe(true);
  });
});
