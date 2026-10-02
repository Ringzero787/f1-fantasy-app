/**
 * `demoRaces` is the calendar the app falls back to when the remote-config
 * fetch is empty or fails, so it is not dead demo data — it is the shipped
 * fallback, and `remoteConfig.store` seeds state with it before any fetch
 * completes. That makes a wrong entry here a real wrong answer in the app.
 *
 * It was wrong: the 2026 renumber (Bahrain cancelled at Sakhir, reinstated at
 * Sepang as round 18, Singapore..Abu Dhabi each pushed up one) never reached
 * this file. Bahrain sat at round 4, `status: 'cancelled'`, dated April, at a
 * circuit in the wrong country and timezone. Because `getNextIncompleteRace`
 * skips cancelled races, the app treated Singapore as the next race right
 * through the Bahrain weekend and left the Ace unlocked.
 *
 * So this pins the shipped fallback against the same fixture that
 * functions/test/roundMapping.test.js pins ROUND_TO_RACE_ID against. One
 * fixture, two consumers: the server's round table and the client's fallback
 * calendar cannot drift from each other without one of these two tests failing.
 */
import * as fs from 'fs';
import * as path from 'path';
import { demoRaces } from '../../src/data/demoData';

const FIXTURE = path.join(__dirname, '..', '..', 'functions', 'test', 'fixtures', 'races2026.json');

type FixtureRace = { id: string; round: number; status: string; hasSprint?: boolean };

const fixtureRaces = (): FixtureRace[] => {
  // A missing fixture is a hard failure, not a skip. The predecessor of this
  // test read its calendar from a directory that was about to be deleted and
  // skipped silently when it went; that is the mistake being avoided here.
  if (!fs.existsSync(FIXTURE)) {
    throw new Error(`race calendar fixture missing (${FIXTURE}) — this test proves nothing without it`);
  }
  const parsed = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const races = Array.isArray(parsed) ? parsed : parsed.races;
  if (!Array.isArray(races) || races.length === 0) {
    throw new Error('race calendar fixture parsed but holds no races');
  }
  return races as FixtureRace[];
};

const shape = (r: { id: string; round: number; status?: string; hasSprint?: boolean }) => ({
  id: r.id,
  round: r.round,
  status: r.status,
  hasSprint: r.hasSprint === true,
});
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

test('demoRaces matches the race calendar fixture exactly', () => {
  // Set equality in one assertion, so neither a missing race nor an extra one
  // nor a changed round can hide behind a per-item loop.
  expect(demoRaces.map(shape).sort(byId)).toEqual(fixtureRaces().map(shape).sort(byId));
});

test('every demoRaces round is unique', () => {
  // The round is the key the lockout and the points lookup index races by, and
  // a Map keeps the last writer, so a duplicate would hide a race rather than
  // fail anywhere obvious.
  const rounds = demoRaces.map(r => r.round);
  expect(new Set(rounds).size).toBe(rounds.length);
});

test('Bahrain is round 18 at Sepang, not round 4 at Sakhir', () => {
  // The specific regression, named. Worth its own assertion because the set
  // comparison above would also pass if the fixture itself were reverted.
  const bahrain = demoRaces.find(r => r.id === 'bahrain_2026');
  expect(bahrain).toBeDefined();
  expect(bahrain!.round).toBe(18);
  expect(bahrain!.status).toBe('upcoming');
  expect(bahrain!.city).toBe('Sepang');
  expect(bahrain!.timezone).toBe('Asia/Kuala_Lumpur');
  // Run in October, not the cancelled April date.
  expect(new Date(bahrain!.schedule.race).getUTCMonth()).toBe(9);
});

test('the season tail sits one round higher than it did before the renumber', () => {
  const round = (id: string) => demoRaces.find(r => r.id === id)?.round;
  expect(round('azerbaijan_2026')).toBe(17);
  expect(round('singapore_2026')).toBe(19);
  expect(round('usa_2026')).toBe(20);
  expect(round('abu_dhabi_2026')).toBe(25);
  // Round 4 belonged to the cancelled Sakhir race and is deliberately absent,
  // so nothing maps to it.
  expect(demoRaces.some(r => r.round === 4)).toBe(false);
});
