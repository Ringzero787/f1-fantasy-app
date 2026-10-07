// F-107: the settlement decision, the season cap, the cash clamp and the stats are pure and tested here.
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test', storageBucket: 'demo-uc-test.appspot.com' });
const { mergeConfig } = require('../lib/moonshot/config.js');
const { settleDecision, predictionHit, capHit, clampCash, settlementIdFor, nextStats, isSettleable, settleMoonshotsForRace, SETTLEMENT_VERSION, SETTLEABLE_STATUSES } = require('../lib/moonshot/settlement.js');
const { memberSeasonTotal, moonshotShare } = require('../lib/scoring/standingsFields.js');
const admin = require('firebase-admin');
const { rankRaceEntries } = require('../lib/scoring/leagueRaceResults.js');
const { resolveSeat, seatOf } = require('../lib/moonshot/substitute.js');
const { isLive, sessionForRace, latestByDriver, sweepLivePositions } = require('../lib/moonshot/liveSweep.js');
const index = require('../lib/index.js');

const cfg = mergeConfig({ enabled: true });
const call = (predictionType, extra = {}) => ({ predictionType, predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 100, potentialReward: 500, ...extra });

test('predictions: every type against every position that matters', () => {
  assert.ok(predictionHit('WIN', 1)); assert.ok(!predictionHit('WIN', 2));
  assert.ok(predictionHit('PODIUM', 3)); assert.ok(!predictionHit('PODIUM', 4));
  assert.ok(predictionHit('TOP_5', 5)); assert.ok(!predictionHit('TOP_5', 6));
  assert.ok(predictionHit('EXACT_FINISH', 7, 7)); assert.ok(!predictionHit('EXACT_FINISH', 6, 7)); assert.ok(!predictionHit('EXACT_FINISH', 7, null));
});

test('a finisher is compared with the prediction: a hit pays the reward, a miss takes the stake', () => {
  assert.deepEqual(settleDecision(call('PODIUM'), { position: 3, status: 'finished' }, cfg),
    { result: 'HIT', officialDriverFinish: 3, driverStatus: 'finished', adjustmentAmount: 500 });
  assert.deepEqual(settleDecision(call('WIN'), { position: 2, status: 'finished' }, cfg),
    { result: 'MISSED', officialDriverFinish: 2, driverStatus: 'finished', adjustmentAmount: -100 });
  assert.equal(settleDecision(call('EXACT_FINISH', { predictionTarget: 9 }), { position: 9, status: 'finished' }, cfg).result, 'HIT');
});

test('DNF / DNS / DSQ / not classified / cancelled follow the configured rules, and a void adjusts nothing', () => {
  const d = (driver, c = cfg, cancelled = false) => settleDecision(call('TOP_5'), driver, c, cancelled);
  assert.deepEqual([d({ position: 0, status: 'dnf' }).result, d({ position: 0, status: 'dnf' }).adjustmentAmount], ['MISSED', -100]);   // DNF = LOSS
  assert.deepEqual([d({ status: 'dns' }).result, d({ status: 'dns' }).adjustmentAmount], ['VOID', 0]);                                  // DNS = VOID
  assert.equal(d({ position: 4, status: 'dsq' }).result, 'MISSED');                                                                    // DSQ = LOSS, even from P4
  assert.equal(d({ position: 0, status: 'nc' }).result, 'MISSED');                                                                     // ran, not classified → the DNF rule
  assert.equal(d(undefined).result, 'VOID');                                                                                             // not in the classification at all → DNS rule
  assert.equal(d(undefined).driverStatus, 'missing');
  assert.deepEqual([d({ position: 1, status: 'finished' }, cfg, true).result, d({ position: 1 }, cfg, true).driverStatus], ['VOID', 'cancelled']);   // cancelled race voids even a P1
  const flipped = mergeConfig({ enabled: true, dnfRule: 'VOID', dnsRule: 'LOSS', dsqRule: 'VOID', cancelledRule: 'LOSS' });
  assert.equal(d({ status: 'dnf' }, flipped).result, 'VOID');
  assert.equal(d({ status: 'dns' }, flipped).result, 'MISSED');
  assert.equal(d({ position: 2, status: 'dsq' }, flipped).result, 'VOID');
  assert.equal(d({ position: 2, status: 'finished' }, flipped, true).result, 'MISSED');
  assert.equal(d({ status: 'finished' }).result, 'MISSED');   // a "finisher" with no position cannot be compared: the DNF rule
});

test('the season cap pays a hit up to the cap and marks it; misses are never capped', () => {
  assert.deepEqual(capHit(500, 0, 1500), { paid: 500, capped: false });
  assert.deepEqual(capHit(500, 1200, 1500), { paid: 300, capped: true });
  assert.deepEqual(capHit(500, 1500, 1500), { paid: 0, capped: true });
  assert.deepEqual(capHit(-100, 1500, 1500), { paid: -100, capped: false });
  assert.deepEqual(capHit(500, -300, 1500), { paid: 500, capped: false });   // misses so far do not widen the room
  assert.deepEqual(capHit(500, 0, 0), { paid: 0, capped: true });           // a zero cap pays nothing
});

test('cash never goes below zero; a miss larger than the bank is a shortfall', () => {
  assert.deepEqual(clampCash(240, 500), { budget: 740, applied: 500, shortfall: false });
  assert.deepEqual(clampCash(240, -100), { budget: 140, applied: -100, shortfall: false });
  assert.deepEqual(clampCash(60, -100), { budget: 0, applied: -60, shortfall: true });
});

test('the settlement id is one per season, race, call and version', () => {
  assert.equal(settlementIdFor('2026', 'singapore_2026', 'm1'), `2026:singapore_2026:m1:v${SETTLEMENT_VERSION}`);
  assert.notEqual(settlementIdFor('2026', 'singapore_2026', 'm1', 2), settlementIdFor('2026', 'singapore_2026', 'm1', 1));
  assert.deepEqual([...SETTLEABLE_STATUSES], ['CONFIRMED', 'LOCKED', 'LIVE']);   // settled and cancelled calls are never picked up again
});

test('season stats accumulate per currency, count voids apart, and remember the biggest hit', () => {
  const c = { ...call('PODIUM'), id: 'm1', driverId: 'hadjar', raceId: 'austin_2026' };
  let s = nextStats(undefined, c, 'HIT', 500);
  assert.deepEqual([s.used, s.hit, s.pointsRisked, s.pointsWon, s.biggestHit.moonshotId], [1, 1, 100, 500, 'm1']);
  s = nextStats(s, { ...c, id: 'm2', stakeCurrency: 'CASH', stakeAmount: 200, potentialReward: 1000 }, 'MISSED', -200);
  assert.deepEqual([s.used, s.missed, s.cashRisked, s.cashWon, s.pointsWon], [2, 1, 200, 0, 500]);
  s = nextStats(s, { ...c, id: 'm3' }, 'VOID', 0);
  assert.deepEqual([s.used, s.voided], [2, 1]);   // a void spends nothing
  s = nextStats(s, { ...c, id: 'm4', potentialReward: 800 }, 'HIT', 300);   // capped hit: the paid amount is what counts
  assert.deepEqual([s.pointsWon, s.biggestHit.moonshotId], [800, 'm1']);
  s = nextStats(s, { ...c, id: 'm5', stakeCurrency: 'CASH' }, 'HIT', 900);   // cash is another scale: never the points record
  assert.equal(s.biggestHit.moonshotId, 'm1');
  assert.equal(nextStats(undefined, { ...c, id: 'm6' }, 'HIT', 0).biggestHit, null);   // a hit capped to nothing is no record
});

test('the member season total is one definition: active + banked + Moonshot, absent fields read as zero', () => {
  assert.equal(memberSeasonTotal({ totalPoints: 1200, lockedPoints: 300, moonshotPoints: 500 }), 2000);
  assert.equal(memberSeasonTotal({ totalPoints: 1200, lockedPoints: 300 }), 1500);
  assert.equal(memberSeasonTotal({ totalPoints: 100, moonshotPoints: -100 }), 0);
  assert.equal(memberSeasonTotal({}), 0);
  assert.equal(moonshotShare({ moonshotPoints: 'lots' }), 0);
});

test('only an unsettled confirmed, locked or live call is picked up', () => {
  assert.ok(isSettleable({ status: 'CONFIRMED' })); assert.ok(isSettleable({ status: 'LOCKED' })); assert.ok(isSettleable({ status: 'LIVE' }));
  assert.ok(!isSettleable({ status: 'CONFIRMED', settledAt: new Date() }));
  for (const st of ['CANCELLED', 'HIT', 'MISSED', 'VOID', undefined]) assert.ok(!isSettleable({ status: st }), String(st));
});

// A stubbed Firestore: just enough of the Admin SDK surface settlement touches, recording every write.
function fakeDb(docs) {
  const store = new Map(Object.entries(docs).map(([k, v]) => [k, { ...v }]));
  const writes = [];
  const docRef = (path) => ({
    path, id: path.split('/').pop(),
    collection: (name) => ({ doc: (id) => docRef(`${path}/${name}/${id}`) }),
    async get() { return snapOf(path); },
    async set(data, opts) { apply('set', path, data, !!(opts && opts.merge)); },
    async update(data) { apply('update', path, data, true); },
  });
  const snapOf = (path) => ({ id: path.split('/').pop(), ref: docRef(path), exists: store.has(path), data: () => (store.has(path) ? { ...store.get(path) } : undefined) });
  const apply = (op, path, data, merge) => {
    writes.push({ op, path, data });
    const prev = store.get(path) ?? {};
    const deep = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && v.constructor === Object && a[k] && typeof a[k] === 'object' ? deep(a[k], v) : v; return o; };
    store.set(path, op === 'update' || merge ? deep(prev, data) : { ...data });
  };
  const db = {
    writes, store,
    doc: docRef,
    collection: (name) => ({
      where() { return this; },
      orderBy() { return this; },
      limit() { return this; },
      async get() { const docsOut = [...store.keys()].filter((k) => k.startsWith(`${name}/`) && k.split('/').length === 2).map(snapOf); return { empty: docsOut.length === 0, docs: docsOut, size: docsOut.length }; },
    }),
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return snapOf(ref.path); },
        set(ref, data, opts) { apply('set', ref.path, data, !!(opts && opts.merge)); },
        update(ref, data) { apply('update', ref.path, data, true); },
      };
      return fn(tx);
    },
  };
  return db;
}

test('settlement is idempotent: the first run settles every open call, the second changes nothing', async () => {
  const db = fakeDb({
    'config/app': { moonshot: { enabled: true } },
    'fantasyTeams/tA': { userId: 'alice', leagueId: 'L1', totalPoints: 100, lockedPoints: 0, budget: 240 },
    'moonshots/m1': { teamId: 'tA', userId: 'alice', leagueId: 'L1', seasonId: '2026', raceId: 'r1', driverId: 'hadjar', predictionType: 'PODIUM', predictionTarget: null, stakeCurrency: 'POINTS', stakeAmount: 200, multiplier: 5, potentialReward: 1000, status: 'CONFIRMED', lockAt: 1 },
    'moonshots/m2': { teamId: 'tA', userId: 'alice', leagueId: 'L1', seasonId: '2026', raceId: 'r1', driverId: 'norris', predictionType: 'WIN', predictionTarget: null, stakeCurrency: 'CASH', stakeAmount: 100, multiplier: 2.5, potentialReward: 250, status: 'LOCKED', lockAt: 1 },
    'moonshots/m3': { teamId: 'tGone', userId: 'bob', leagueId: null, seasonId: '2026', raceId: 'r1', driverId: 'norris', predictionType: 'WIN', stakeCurrency: 'POINTS', stakeAmount: 50, potentialReward: 125, status: 'CONFIRMED' },
  });
  const race = { seasonId: '2026', round: 19, name: 'Round 19', results: { raceResults: [{ driverId: 'hadjar', position: 3, status: 'finished' }, { driverId: 'norris', position: 2, status: 'finished' }] } };
  const first = await settleMoonshotsForRace(db, 'r1', race);
  assert.deepEqual(first, { settled: 3, skipped: 0, failed: 0 });
  const m1 = db.store.get('moonshots/m1'), m2 = db.store.get('moonshots/m2'), m3 = db.store.get('moonshots/m3'), team = db.store.get('fantasyTeams/tA');
  assert.deepEqual([m1.status, m1.adjustmentAmount, m1.settlementId, m1.officialDriverFinish, m1.settledOnDriverId], ['HIT', 1000, '2026:r1:m1:v1', 3, 'hadjar']);
  assert.equal(db.store.get('leagues/L1/activity/m1_settled').settledOnDriverId, 'hadjar');
  assert.deepEqual([m2.status, m2.adjustmentAmount], ['MISSED', -100]);
  assert.deepEqual([team.moonshotPoints, team.budget, team.totalPoints, team.moonshotStats.hit, team.moonshotStats.missed], [1000, 140, 100, 1, 1]);   // totalPoints untouched
  assert.deepEqual([m3.status, m3.officialDriverStatus], ['VOID', 'team-missing']);
  assert.ok(!db.store.has('fantasyTeams/tGone'), 'a deleted team is not resurrected');
  assert.ok(db.store.has('leagues/L1/activity/m1_settled') && db.store.has('leagues/L1/activity/m2_settled'));
  assert.deepEqual([db.store.get('fantasyTeams/tA/raceSnapshots/r1').moonshots.m1.adjustmentAmount, db.store.get('fantasyTeams/tA/raceSnapshots/r1').moonshots.m2.adjustmentAmount], [1000, -100]);   // keyed by call: both survive
  assert.ok(m1.settledAt instanceof admin.firestore.FieldValue);

  const before = db.writes.length;
  const second = await settleMoonshotsForRace(db, 'r1', race);
  assert.deepEqual(second, { settled: 0, skipped: 3, failed: 0 });
  assert.equal(db.writes.length, before, 'the second pass issues no writes');
  assert.deepEqual([db.store.get('fantasyTeams/tA').moonshotPoints, db.store.get('fantasyTeams/tA').budget], [1000, 140]);
});

test('a void returns the token and a cancelled race creates no weekend record', async () => {
  const db = fakeDb({
    'config/app': { moonshot: { enabled: true } },
    'fantasyTeams/tA': { userId: 'alice', leagueId: 'L1', totalPoints: 100, budget: 240 },
    'moonshotTokens/tA_2026': { teamId: 'tA', userId: 'alice', seasonId: '2026', used: 1 },
    'moonshots/m1': { teamId: 'tA', userId: 'alice', leagueId: 'L1', seasonId: '2026', raceId: 'r2', driverId: 'hadjar', predictionType: 'WIN', stakeCurrency: 'POINTS', stakeAmount: 200, potentialReward: 1000, status: 'CONFIRMED' },
  });
  const out = await settleMoonshotsForRace(db, 'r2', { seasonId: '2026', round: 20, status: 'cancelled' }, { cancelled: true });
  assert.deepEqual(out, { settled: 1, skipped: 0, failed: 0 });
  assert.equal(db.store.get('moonshots/m1').status, 'VOID');
  assert.equal(db.store.get('fantasyTeams/tA').moonshotPoints, undefined);                      // a void adjusts nothing
  assert.equal(db.store.get('fantasyTeams/tA').moonshotStats.voided, 1);
  assert.ok(db.writes.some((w) => w.path === 'moonshotTokens/tA_2026'), 'the token comes back');
  assert.ok(!db.store.has('fantasyTeams/tA/raceSnapshots/r2'), 'no weekend record for a race that never ran');
  assert.equal(db.store.get('leagues/L1/activity/m1_settled').type, 'MOONSHOT_VOID');
});

test('race entries carry race points, Moonshot points and the race total; ranking and wins stay on race points', () => {
  const r = rankRaceEntries([{ userId: 'a', points: 187, moonshotPoints: 500 }, { userId: 'b', points: 190 }, { userId: 'c', points: 50, moonshotPoints: -100 }]);
  assert.deepEqual(r.entries.map((e) => [e.userId, e.racePoints, e.moonshotPoints, e.raceTotal, e.rank]), [['b', 190, 0, 190, 1], ['a', 187, 500, 687, 2], ['c', 50, -100, -50, 3]]);
  assert.deepEqual(r.winners, ['b']);
});

test('the cancelled-race trigger is exported', () => {
  assert.equal(typeof index.onRaceCancelled, 'function');
});

test('the call follows the car: an absent driver settles on the one substitute in that seat, never on a team-mate', () => {
  const drivers = [{ id: 'hadjar', constructorId: 'rb', isActive: true }, { id: 'lawson', constructorId: 'rb', isActive: true }, { id: 'norris', constructorId: 'mclaren', isActive: true }];
  const results = [{ driverId: 'lawson', constructorId: 'rb', position: 6, status: 'finished' }, { driverId: 'lindblad', constructorId: 'rb', position: 3, status: 'finished' }, { driverId: 'norris', constructorId: 'mclaren', position: 1, status: 'finished' }];
  assert.deepEqual(resolveSeat('hadjar', results, drivers), { result: results[1], substituteId: 'lindblad' });   // Lindblad drove Hadjar's car
  assert.deepEqual(resolveSeat('lawson', results, drivers), { result: results[0], substituteId: null });          // present: his own result
  assert.deepEqual(resolveSeat('hadjar', [results[0], results[2]], drivers), { result: undefined, substituteId: null });   // nobody in the seat: the DNS rule
  const withDns = [{ driverId: 'hadjar', constructorId: 'rb', position: 0, status: 'dns' }, ...results];
  assert.deepEqual(resolveSeat('hadjar', withDns, drivers), { result: results[1], substituteId: 'lindblad' });   // listed DNS beside his replacement: the car wins
  assert.deepEqual(resolveSeat('hadjar', [withDns[0], results[0], results[2]], drivers), { result: withDns[0], substituteId: null });   // listed DNS, nobody in the seat: his own row
  assert.deepEqual(resolveSeat('ghost', results, drivers), { result: undefined, substituteId: null });            // unknown driver, unknown car
  const twoStrangers = [...results, { driverId: 'someone', constructorId: 'rb', position: 9, status: 'finished' }];
  assert.equal(resolveSeat('hadjar', twoStrangers, drivers).substituteId, null);                                    // two strangers in one team: no guess
  // the seat stamped at confirm wins over today's roster: Lawson moved teams since, but he was Hadjar's team-mate then
  const moved = [{ id: 'hadjar', constructorId: 'rb', isActive: true }, { id: 'lawson', constructorId: 'mclaren', isActive: true }, { id: 'norris', constructorId: 'mclaren', isActive: true }];
  assert.equal(resolveSeat('hadjar', results, moved).substituteId, null);                                           // two strangers for rb today: no guess
  assert.equal(resolveSeat('hadjar', results, moved, seatOf('hadjar', drivers)).substituteId, 'lindblad');          // the stamp knows Lawson was the team-mate
  assert.deepEqual(seatOf('hadjar', drivers), { constructorId: 'rb', regulars: ['hadjar', 'lawson'] });
  assert.deepEqual(seatOf('ghost', drivers), { constructorId: null, regulars: [] });
  // through the decision: the sub's podium is the caller's hit
  assert.equal(settleDecision(call('PODIUM'), resolveSeat('hadjar', results, drivers).result, cfg).result, 'HIT');
});

test('the owner\u2019s rules: DNS and DNF both lose, so an absent driver with no substitute costs the stake', () => {
  const owner = mergeConfig({ enabled: true, dnsRule: 'LOSS', dnfRule: 'LOSS' });
  assert.deepEqual([settleDecision(call('WIN'), undefined, owner).result, settleDecision(call('WIN'), { status: 'dns' }, owner).result, settleDecision(call('WIN'), { position: 0, status: 'dnf' }, owner).result], ['MISSED', 'MISSED', 'MISSED']);
});

test('the live sweep: the race window, the race session on the race day, the latest position per car mapped to drivers', () => {
  const start = Date.UTC(2026, 9, 11, 12);
  const race = { id: 'r', status: 'upcoming', schedule: { race: new Date(start) } };
  assert.equal(isLive(race, start - 31 * 60e3), false); assert.equal(isLive(race, start - 29 * 60e3), true); assert.equal(isLive(race, start), true); assert.equal(isLive(race, start + 3 * 3600e3 + 1), false);
  assert.equal(isLive({ ...race, status: 'in_progress' }, start - 2 * 24 * 3600e3), false);   // Friday's lock sets in_progress; that alone never opens the window
  assert.equal(isLive({ ...race, status: 'in_progress' }, start + 5 * 3600e3), true); assert.equal(isLive({ ...race, status: 'in_progress' }, start + 6 * 3600e3 + 1), false);
  assert.equal(isLive({ ...race, status: 'completed' }, start + 1), false);
  assert.equal(isLive({ id: 'r', status: 'upcoming', schedule: { race: { toMillis: () => start } } }, start + 60e3), true);   // a Firestore Timestamp
  const sessions = [{ session_key: 9, session_name: 'Sprint', date_start: '2026-10-10T07:00:00+00:00' }, { session_key: 2, session_name: 'Race', date_start: '2026-10-11T20:00:00+08:00' }];
  assert.equal(sessionForRace(sessions, start)?.session_key, 2);
  assert.equal(sessionForRace(sessions, Date.UTC(2026, 9, 10, 7)), null);
  const rows = [{ driver_number: 6, position: 5, date: '2026-10-11T12:05:00Z' }, { driver_number: 6, position: 4, date: '2026-10-11T12:40:00Z' }, { driver_number: 6, position: 9, date: 'garbage' }, { driver_number: 99, position: 1, date: '2026-10-11T12:40:00Z' }];
  assert.deepEqual(latestByDriver(rows, { 6: 'hadjar' }), { hadjar: 4 });   // latest wins, a bad time is skipped, an unknown car is dropped
  assert.equal(typeof index.moonshotLiveSweep, 'function');
});

test('the sweep: off does nothing; on, it finds the live race, looks the session up once, and writes the latest positions', async () => {
  const start = Date.UTC(2026, 9, 11, 12);
  const docs = {
    'config/app': { moonshot: { enabled: true, liveTiming: true } },
    'races/singapore_2026': { seasonId: '2026', status: 'in_progress', round: 19, schedule: { race: { toMillis: () => start } } },
    'races/austin_2026': { seasonId: '2026', status: 'upcoming', round: 20, schedule: { race: { toMillis: () => start + 7 * 24 * 3600e3 } } },
  };
  let sessionCalls = 0;
  const feed = { sessions: async () => { sessionCalls++; return [{ session_key: 2, session_name: 'Race', date_start: '2026-10-11T12:00:00+00:00' }]; }, positions: async () => [{ driver_number: 6, position: 4, date: '2026-10-11T12:40:00Z' }, { driver_number: 1, position: 1, date: '2026-10-11T12:40:00Z' }] };
  const off = fakeDb({ ...docs, 'config/app': { moonshot: { enabled: true } } });
  assert.deepEqual(await sweepLivePositions(off, start + 60e3, feed), { raceId: null, written: false, drivers: 0, off: true });
  assert.equal(off.writes.length, 0);
  const db = fakeDb(docs);
  const first = await sweepLivePositions(db, start + 60e3, feed);
  const written = db.store.get('races/singapore_2026/live/positions');
  assert.deepEqual([first.raceId, first.written, first.drivers], ['singapore_2026', true, Object.keys(written.byDriver).length]);
  assert.deepEqual([written.raceId, written.sessionKey, written.source, written.byDriver.hadjar], ['singapore_2026', 2, 'openf1', 4]);   // car 6 is Hadjar in the ingestion table; car 1 maps to whoever carries it this season
  await sweepLivePositions(db, start + 120e3, feed);
  assert.equal(sessionCalls, 1);   // the second minute reuses the stored session key
  assert.deepEqual(await sweepLivePositions(db, start + 7 * 3600e3, feed), { raceId: null, written: false, drivers: 0 });   // seven hours on, still marked in progress: the six-hour cap closed the window
});
