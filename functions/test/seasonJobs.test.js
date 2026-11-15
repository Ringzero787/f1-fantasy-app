// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-149, the jobs rather than the helpers: which races the results, qualifying/sprint, schedule
// sync, schedule monitor and live sweep jobs pick up, against a stubbed Firestore and the real 2026
// OpenF1 calendar. season.test.js proves the matcher; this proves the jobs apply it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
if (admin.apps.length === 0) admin.initializeApp({ projectId: 'demo-f149' });
const { Timestamp } = admin.firestore;

const { dueCandidates, openRaceMeetings } = require('../lib/ingestion/checkResults.js');
const { syncSchedules } = require('../lib/ingestion/syncSchedule.js');
const { checkScheduleChanges } = require('../lib/ingestion/scheduleMonitor.js');
const { sweepLivePositions } = require('../lib/moonshot/liveSweep.js');

const SESSIONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'openf1Sessions2026.json'), 'utf8')).sessions;
const H = 3600e3, D = 24 * H;
const VEGAS = Date.parse('2026-11-22T04:00:00Z');
const QATAR = Date.parse('2026-11-29T16:00:00Z');
const ts = (ms) => Timestamp.fromMillis(ms);

/** A stubbed Firestore: collection queries honour `==` / `!=` / `in` filters, every write is recorded. */
function fakeDb(docs) {
  const store = new Map(Object.entries(docs).map(([k, v]) => [k, { ...v }]));
  const writes = [];
  const docRef = (p) => ({
    path: p, id: p.split('/').pop(),
    collection: (name) => ({ doc: (id) => docRef(`${p}/${name}/${id}`) }),
    async get() { return snapOf(p); },
    async set(data) { writes.push({ op: 'set', path: p, data }); store.set(p, { ...data }); },
    async update(data) {
      writes.push({ op: 'update', path: p, data });
      // like Firestore, a dotted key updates a nested field
      const next = { ...(store.get(p) || {}) };
      for (const [k, v] of Object.entries(data)) {
        const parts = k.split('.');
        let o = next;
        for (const part of parts.slice(0, -1)) o = o[part] = { ...(o[part] || {}) };
        o[parts[parts.length - 1]] = v;
      }
      store.set(p, next);
    },
  });
  const snapOf = (p) => ({ id: p.split('/').pop(), ref: docRef(p), exists: store.has(p), data: () => (store.has(p) ? { ...store.get(p) } : undefined) });
  const query = (name, filters) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]]),
    orderBy: () => query(name, filters),
    limit: () => query(name, filters),
    async get() {
      const out = [...store.keys()]
        .filter((k) => k.startsWith(`${name}/`) && k.split('/').length === 2)
        .map(snapOf)
        .filter((s) => filters.every(([f, op, v]) => {
          const x = s.data()[f];
          if (op === '==') return x === v;
          if (op === '!=') return x !== undefined && x !== v;
          if (op === 'in') return v.includes(x);
          throw new Error(`fake db: no ${op}`);
        }));
      return { empty: out.length === 0, docs: out, size: out.length };
    },
  });
  return {
    writes, store, doc: docRef,
    collection: (name) => ({ ...query(name, []), doc: (id) => docRef(`${name}/${id}`), add: async (data) => { writes.push({ op: 'add', path: name, data }); } }),
  };
}

/** The feed: the 2026 calendar for 2026, nothing for any other year; records which years were asked. */
function feed() {
  const years = [];
  const fetch = async (y) => { years.push(y); return y === 2026 ? SESSIONS : []; };
  return { fetch, years };
}

const race = (seasonId, status, raceMs, extra = {}) => ({ seasonId, status, round: 0, name: 'x', schedule: { race: ts(raceMs) }, ...extra });

test('results check: only past, open races of a season with a car-number table are fetched', () => {
  const db = fakeDb({
    'races/brazil_2026': race('2026', 'completed', Date.parse('2026-11-08T17:00:00Z')),
    'races/saudi_2026': race('2026', 'cancelled', Date.parse('2026-04-19T17:00:00Z')),
    'races/las_vegas_2026': race('2026', 'upcoming', VEGAS, { round: 23 }),
    'races/qatar_2026': race('2026', 'upcoming', QATAR, { round: 24 }),
    'races/australia_2027': race('2027', 'upcoming', Date.parse('2027-03-07T04:00:00Z'), { round: 1 }),
    'races/bad_2026': race('2027', 'upcoming', VEGAS - 30 * D),
  });
  const docs = [...db.store.keys()].map((k) => ({ id: k.split('/')[1], data: () => db.store.get(k) }));
  // the morning after Las Vegas: Vegas is due; Qatar is not yet; the mislabelled doc is due but refused
  assert.deepEqual(dueCandidates(docs, VEGAS + 3 * H).map((c) => [c.raceId, c.season, c.raceMs]), [['las_vegas_2026', 2026, VEGAS]]);
  // the day after the 2027 opener: due, and held for the car-number table rather than matched
  assert.deepEqual(dueCandidates(docs, Date.parse('2027-03-08T00:00:00Z')).map((c) => c.raceId).sort(), ['las_vegas_2026', 'qatar_2026']);
});

test('qualifying and sprint checks: open races within three days, each with its own 2026 meeting; a due 2027 race is held without a fetch', async () => {
  const db = fakeDb({
    'races/brazil_2026': race('2026', 'completed', Date.parse('2026-11-08T17:00:00Z')),
    'races/las_vegas_2026': race('2026', 'upcoming', VEGAS, { round: 23 }),
    'races/qatar_2026': race('2026', 'upcoming', QATAR, { round: 24 }),
    'races/abu_dhabi_2026': race('2026', 'upcoming', Date.parse('2026-12-06T13:00:00Z'), { round: 25 }),
  });
  const f = feed();
  // Saturday of Las Vegas: qualifying is over, the race is tomorrow; Qatar is a week out
  const got = await openRaceMeetings('test', db, f.fetch, VEGAS - 20 * H);
  assert.deepEqual(got.map((r) => [r.raceId, r.round, r.meeting.race.circuit_short_name]), [['las_vegas_2026', 23, 'Las Vegas']]);
  assert.ok(got[0].meeting.sessions.some((s) => s.session_name === 'Qualifying'));
  assert.deepEqual(f.years, [2026]);

  const db27 = fakeDb({ 'races/australia_2027': race('2027', 'upcoming', Date.parse('2027-03-07T04:00:00Z'), { round: 1 }) });
  const f27 = feed();
  assert.deepEqual(await openRaceMeetings('test', db27, f27.fetch, Date.parse('2027-03-06T06:00:00Z')), []);
  assert.deepEqual(f27.years, [], 'a season without a car-number table is never fetched');
});

test('sprint weekends: the meeting carries the Sprint session the sprint check scores', async () => {
  const sg = Date.parse('2026-10-11T12:00:00Z');
  const db = fakeDb({ 'races/singapore_2026': race('2026', 'upcoming', sg, { round: 19 }) });
  const [r] = await openRaceMeetings('test', db, feed().fetch, sg - 30 * H);
  assert.ok(r.meeting.sessions.some((s) => s.session_name === 'Sprint'));
  const db2 = fakeDb({ 'races/las_vegas_2026': race('2026', 'upcoming', VEGAS) });
  const [v] = await openRaceMeetings('test', db2, feed().fetch, VEGAS - 30 * H);
  assert.ok(!v.meeting.sessions.some((s) => s.session_name === 'Sprint'));
});

test('schedule sync: follows a correction of hours, refuses a jump over a day, leaves completed, cancelled and other-season races alone', async () => {
  const db = fakeDb({
    // OpenF1 has Vegas at 04:00; the doc says 06:00 — a two-hour correction is followed
    'races/las_vegas_2026': race('2026', 'upcoming', VEGAS + 2 * H, { round: 23 }),
    // Qatar 40 h off: inside the match window, outside the follow cap — not written
    'races/qatar_2026': race('2026', 'upcoming', QATAR - 40 * H, { round: 24 }),
    'races/brazil_2026': race('2026', 'completed', Date.parse('2026-11-08T19:00:00Z')),
    'races/saudi_2026': race('2026', 'cancelled', Date.parse('2026-04-19T17:00:00Z')),
    'races/australia_2027': race('2027', 'upcoming', Date.parse('2027-03-07T04:00:00Z')),
  });
  const f = feed();
  assert.equal(await syncSchedules(db, f.fetch), 1);
  assert.deepEqual(db.writes.map((w) => w.path), ['races/las_vegas_2026']);
  const w = db.writes[0].data;
  assert.equal(w['schedule.race'].toMillis(), VEGAS);
  assert.equal(w['schedule.qualifying'].toMillis(), Date.parse('2026-11-21T04:00:00Z'), 'the meeting\'s other sessions come with it');
  assert.equal(w.hasSprint, undefined);
  assert.deepEqual(f.years.sort(), [2026, 2027]);
  // a second run matches Vegas again (its stored race time is a real Timestamp) and finds nothing to change
  db.writes.length = 0;
  assert.equal(db.store.get('races/las_vegas_2026').schedule.race.toMillis(), VEGAS);
  assert.equal(await syncSchedules(db, feed().fetch), 0);
  assert.deepEqual(db.writes, []);
});

test('schedule monitor: flags an unmatched or moved race, never cancels on an empty calendar, still cancels a race OpenF1 dropped', async () => {
  const now = VEGAS - 2 * D;
  const db = fakeDb({
    'races/las_vegas_2026': race('2026', 'upcoming', VEGAS, { name: 'Las Vegas', round: 23 }),
    'races/qatar_2026': race('2026', 'upcoming', QATAR - 40 * H, { name: 'Qatar', round: 24 }),
    'races/odd_2026': race('2025', 'upcoming', VEGAS, { name: 'Odd', round: 99 }),
  });
  const changes = await checkScheduleChanges(db, feed().fetch, now);
  assert.ok(!changes.some((c) => c.includes('Las Vegas')), changes.join('\n'));
  assert.ok(changes.some((c) => c.startsWith('CHECK: Qatar (R24)') && c.includes(' 40.0 h')), changes.join('\n'));
  assert.ok(changes.some((c) => c.startsWith('CHECK: Odd (R99)') && c.includes('disagree')), changes.join('\n'));
  assert.ok(!db.writes.some((w) => w.op === 'update'), 'nothing cancelled');

  // a 2027 race two days out with no 2027 calendar published: flagged, and not cancelled the day after
  const opener = Date.parse('2027-03-07T04:00:00Z');
  const db27 = fakeDb({ 'races/australia_2027': race('2027', 'upcoming', opener, { name: 'Australia', round: 1 }) });
  for (const t of [opener - 2 * D, opener + 12 * H]) {
    const c = await checkScheduleChanges(db27, feed().fetch, t);
    assert.ok(c.some((x) => x.includes('no 2027 sessions at all')), c.join('\n'));
  }
  assert.ok(!db27.writes.some((w) => w.op === 'update'), 'a season OpenF1 has not published is never cancelled');

  // a 2026 race with no session anywhere near it, the day after: auto-cancelled, as before
  const ghost = Date.parse('2026-08-09T13:00:00Z');
  const dbg = fakeDb({ 'races/ghost_2026': race('2026', 'upcoming', ghost, { name: 'Ghost', round: 99 }) });
  const cg = await checkScheduleChanges(dbg, feed().fetch, ghost + 6 * H);
  assert.ok(cg.includes('AUTO-CANCELLED: Ghost (R99)'), cg.join('\n'));
  assert.deepEqual(dbg.writes.filter((w) => w.op === 'update').map((w) => [w.path, w.data.status]), [['races/ghost_2026', 'cancelled']]);
});

test('live sweep: a race from a season without a car-number table shows nothing live', async () => {
  const opener = Date.parse('2027-03-07T04:00:00Z');
  const db = fakeDb({
    'config/app': { moonshot: { enabled: true, liveTiming: true } },
    'races/australia_2027': race('2027', 'in_progress', opener, { round: 1 }),
  });
  let asked = 0;
  const f = { sessions: async () => { asked++; return []; }, positions: async () => [], grid: async () => ({}), entries: async () => ({ constructorOf: {}, numberToId: {} }), fastestLap: async () => null };
  assert.deepEqual(await sweepLivePositions(db, opener + 30 * 60e3, f), { raceId: 'australia_2027', written: false, drivers: 0 });
  assert.equal(asked, 0);
  assert.deepEqual(db.writes, []);
});
