import { tileDetail } from '../../src/simple/grid/tileDetail';

const entry = { id: 'varga', name: 'Rafael Varga', purchasePrice: 300, currentPrice: 320, pointsScored: 96, racesHeld: 2, contractLength: 4 };
const score = (round: number, totalPoints: number, extra = {}) => ({ round, raceId: `r${round}`, totalPoints, ...extra });
const opts = { defaultContract: 3, aceMaxPrice: 200 };

describe('tileDetail', () => {
  it('derives points, price, contract, trend and the sale quote', () => {
    const d = tileDetail(entry, { ...opts, marketPrice: 340, last: score(17, 30), prev: score(16, 18) });
    expect(d).toMatchObject({ seasonPoints: 96, perRace: 48, price: 340, paid: 300, priceDelta: 40, aceEligible: false });
    expect(d.contract).toMatchObject({ length: 4, left: 2 });
    expect(d.trend).toMatchObject({ glyph: '▲', last: 30 });
    // 2 of 4 held → early-termination fee on the live price
    expect(d.sale.marketPrice).toBe(340);
    expect(d.sale.fee).toBeGreaterThan(0);
    expect(d.sale.saleReturn).toBe(340 - d.sale.fee);
  });
  it('waives the fee in the grace period and for reserve picks, and allows a cheap ace', () => {
    const fresh = tileDetail({ ...entry, racesHeld: 0, currentPrice: 150, purchasePrice: 150 }, opts);
    expect(fresh.sale).toMatchObject({ fee: 0, saleReturn: 150, feeWaived: true });
    expect(fresh.perRace).toBeNull();
    expect(fresh.aceEligible).toBe(true);
    expect(tileDetail({ ...entry, isReservePick: true }, opts).sale.fee).toBe(0);
  });
  it('breaks the last race down and keeps the last five rounds of form in order', () => {
    const d = tileDetail(entry, {
      ...opts,
      last: score(17, 41, { position: 2, gridPosition: 5, racePoints: 37, qualiPoints: 1, positionsGained: 3, fastestLap: true }),
      history: [score(17, 41), score(12, 5), score(13, 9), score(16, 18), score(14, 0), score(15, 22), score(11, 7)],
    });
    expect(d.lastRace).toEqual({ total: 41, parts: [
      { label: 'FINISH', value: 'P2' }, { label: 'GRID', value: 'P5' }, { label: 'RACE', value: '37' },
      { label: 'QUALI', value: '1' }, { label: 'GAINED', value: '+3' }, { label: 'FASTEST LAP', value: '✓' },
    ] });
    expect(d.form.map((f) => f.round)).toEqual([13, 14, 15, 16, 17]);
  });
  it('shows a retirement status and handles no scores', () => {
    const d = tileDetail(entry, { ...opts, last: score(17, -5, { position: null, status: 'dnf', racePoints: 0 }) });
    expect(d.lastRace?.parts[0]).toEqual({ label: 'FINISH', value: 'DNF' });
    const none = tileDetail(entry, opts);
    expect(none.lastRace).toBeNull();
    expect(none.form).toEqual([]);
    expect(none.trend.glyph).toBe('•');
  });
});
