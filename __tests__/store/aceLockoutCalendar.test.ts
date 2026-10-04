/**
 * The Ace lock must be computed from the race calendar the server actually
 * publishes, not from the calendar bundled into the app at build time.
 *
 * `__tests__/utils/lockout.test.ts` already covers computeLockoutStatus itself.
 * It was never the broken part. The bug was which array team.store handed it:
 * it read `demoRaces` from src/data/demoData.ts, which still carried the
 * pre-renumber 2026 season — bahrain_2026 as round 4, `status: 'cancelled'`,
 * dated April, when the reinstated race was actually run at Sepang in October.
 * getNextIncompleteRace skips cancelled races, so through the whole Bahrain
 * weekend the store believed the next race was Singapore on 2026-10-11 and
 * reported aceLocked: false. Meanwhile useLockoutStatus, which the screens use,
 * read the remote-config store and said the opposite. The screens and the guard
 * that actually permits the write disagreed.
 *
 * So these tests pin the wiring rather than the arithmetic: the mocked calendar
 * below exists only in the remote-config store, so pointing team.store back at
 * the bundled list fails one of them whichever way the bundled data happens to
 * read. Which one moves as demoData is corrected, and that is worth knowing
 * when one of these fails: while demoData still had Bahrain cancelled in April,
 * a revert failed the locked case with `Received: null` — the mid-race Ace
 * change going through. Now that demoData agrees with the server, a revert
 * instead fails the cancelled-race case, because the real calendar does not
 * call that weekend cancelled. The guard holds either way; only the symptom
 * moves.
 */
import type { FantasyTeam } from '../../src/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/team.service', () => ({
  teamService: {
    syncTeam: jest.fn(async () => undefined),
    getTeamById: jest.fn(async () => null),
    setAce: jest.fn(async () => undefined),
  },
}));
jest.mock('../../src/services/errorLog.service', () => ({
  errorLogService: { logError: jest.fn() },
}));
jest.mock('../../src/store/auth.store', () => ({
  useAuthStore: { getState: () => ({ isDemoMode: false, user: { id: 'u1' } }) },
}));
jest.mock('../../src/store/admin.store', () => ({
  useAdminStore: {
    getState: () => ({
      raceResults: {},
      driverPrices: {},
      constructorPrices: {},
      adminLockOverride: null,
      getCompletedRaceCount: () => 17,
    }),
  },
}));

// The only place the calendar comes from. Mutated per test.
let races: unknown[] = [];
jest.mock('../../src/store/remoteConfig.store', () => ({
  useRemoteConfigStore: { getState: () => ({ races }) },
}));

import { useTeamStore } from '../../src/store/team.store';

const ACE_LOCKED = 'Ace selection is locked once the race starts';

// Bahrain reinstated at Sepang as round 18, exactly as the server publishes it.
const bahrainAtSepang = (status: string) => ({
  id: 'bahrain_2026',
  seasonId: '2026',
  round: 18,
  name: 'Bahrain Grand Prix',
  hasSprint: false,
  status,
  schedule: {
    fp3: new Date('2026-10-03T07:30:00Z'),
    qualifying: new Date('2026-10-03T11:00:00Z'),
    race: new Date('2026-10-04T09:00:00Z'),
  },
});
const singapore = {
  id: 'singapore_2026',
  seasonId: '2026',
  round: 19,
  name: 'Singapore Grand Prix',
  hasSprint: false,
  status: 'upcoming',
  schedule: {
    fp3: new Date('2026-10-10T10:30:00Z'),
    qualifying: new Date('2026-10-10T14:00:00Z'),
    race: new Date('2026-10-11T12:00:00Z'),
  },
};

const team = (): FantasyTeam =>
  ({
    id: 'T1',
    userId: 'u1',
    leagueId: 'L1',
    name: 'Team',
    drivers: [
      { driverId: 'norris', name: 'norris', constructorId: 'mclaren', purchasePrice: 200, currentPrice: 200, pointsScored: 0, racesHeld: 1, contractLength: 3, addedAtRace: 1 },
      { driverId: 'hadjar', name: 'hadjar', constructorId: 'rb', purchasePrice: 100, currentPrice: 100, pointsScored: 0, racesHeld: 1, contractLength: 3, addedAtRace: 1 },
    ],
    constructor: { constructorId: 'audi', name: 'Audi', purchasePrice: 150, currentPrice: 150, pointsScored: 0, racesHeld: 1, contractLength: 3 },
    budget: 700,
    totalSpent: 300,
    totalPoints: 0,
    lockedPoints: 0,
    aceDriverId: null,
    racesSinceTransfer: 2,
    isLocked: false,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  }) as unknown as FantasyTeam;

beforeEach(() => {
  jest.useFakeTimers();
  useTeamStore.setState({ currentTeam: team(), error: null } as never);
});
afterEach(() => {
  jest.useRealTimers();
});

test('the Ace is locked once the server calendar says the race has started', async () => {
  races = [bahrainAtSepang('upcoming'), singapore];
  // Mid-race at Sepang. The bundled calendar has no race here at all — it calls
  // this weekend cancelled — so reading it would leave the Ace unlocked.
  jest.setSystemTime(new Date('2026-10-04T10:30:00Z'));

  await useTeamStore.getState().setAce('hadjar');

  expect(useTeamStore.getState().error).toBe(ACE_LOCKED);
  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBeNull();
});

test('the Ace is still changeable before that race starts', async () => {
  races = [bahrainAtSepang('upcoming'), singapore];
  jest.setSystemTime(new Date('2026-10-01T09:00:00Z'));

  await useTeamStore.getState().setAce('hadjar');

  expect(useTeamStore.getState().error).not.toBe(ACE_LOCKED);
  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBe('hadjar');
});

// setAceConstructor carries its own copy of the same guard, on the same live
// weekend. Without these two it was possible to revert just that one call site
// to demoRaces and have the whole suite stay green.
test('the constructor Ace is locked once the server calendar says the race has started', async () => {
  races = [bahrainAtSepang('upcoming'), singapore];
  jest.setSystemTime(new Date('2026-10-04T10:30:00Z'));

  await useTeamStore.getState().setAceConstructor('audi');

  expect(useTeamStore.getState().error).toBe(ACE_LOCKED);
  expect(useTeamStore.getState().currentTeam?.aceConstructorId).toBeUndefined();
});

test('the constructor Ace is still changeable before that race starts', async () => {
  races = [bahrainAtSepang('upcoming'), singapore];
  jest.setSystemTime(new Date('2026-10-01T09:00:00Z'));

  await useTeamStore.getState().setAceConstructor('audi');

  expect(useTeamStore.getState().error).not.toBe(ACE_LOCKED);
  expect(useTeamStore.getState().currentTeam?.aceConstructorId).toBe('audi');
});

test('a race the server marks cancelled is skipped, and the next one governs', async () => {
  // If Bahrain really were cancelled, Singapore governs and nothing is locked
  // during what would have been the Bahrain weekend. This is the behaviour the
  // stale bundled calendar produced by accident, asserted here deliberately so
  // the difference between the two is visible rather than implied.
  races = [bahrainAtSepang('cancelled'), singapore];
  jest.setSystemTime(new Date('2026-10-04T10:30:00Z'));

  await useTeamStore.getState().setAce('hadjar');

  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBe('hadjar');
});

// ── F-095: the ace window the SERVER stamped, which is what firestore.rules enforces ──
// The calendar and the window agree during the weekend. They part company four hours
// after the race, when getNextIncompleteRace gives up on that round and moves to the next
// one a week away: the calendar reopens the ace while the rules still refuse the write.
// syncTeamToFirebase only logs its failures, so without this guard the refusal is
// invisible and the player is left looking at an ace the scorer will never see.
const HOUR = 60 * 60 * 1000;
const windowed = (fromIso: string | null, isLocked = true) =>
  ({
    ...team(),
    isLocked,
    lockStatus: {
      isSeasonLocked: false,
      seasonLockRacesRemaining: 0,
      canModify: !isLocked,
      aceLockTime: fromIso ? new Date(fromIso) : null,
      aceLockUntil: fromIso ? new Date(Date.parse(fromIso) + 24 * HOUR) : null,
    },
  }) as unknown as FantasyTeam;

test('the stamped window locks the Ace even after the calendar has moved on', async () => {
  races = [bahrainAtSepang('completed'), singapore];
  // Five hours after lights out at Sepang: the calendar now points at Singapore and says
  // the ace is free, but the team still carries Sepang's window.
  jest.setSystemTime(new Date('2026-10-04T14:00:00Z'));
  useTeamStore.setState({ currentTeam: windowed('2026-10-04T09:00:00Z'), error: null } as never);

  await useTeamStore.getState().setAce('hadjar');
  expect(useTeamStore.getState().error).toBe(ACE_LOCKED);
  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBeNull();

  useTeamStore.setState({ error: null } as never);
  await useTeamStore.getState().setAceConstructor('audi');
  expect(useTeamStore.getState().error).toBe(ACE_LOCKED);

  useTeamStore.setState({ error: null } as never);
  await useTeamStore.getState().clearAce();
  expect(useTeamStore.getState().error).toBe(ACE_LOCKED);
});

test('a window not yet open does not lock the Ace — that gap is the point of it', async () => {
  races = [bahrainAtSepang('upcoming'), singapore];
  // Locked for qualifying, three hours before lights out.
  jest.setSystemTime(new Date('2026-10-04T06:00:00Z'));
  useTeamStore.setState({ currentTeam: windowed('2026-10-04T09:00:00Z'), error: null } as never);

  await useTeamStore.getState().setAce('hadjar');
  expect(useTeamStore.getState().error).toBeNull();
  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBe('hadjar');
});

test('the window expires, so one nobody cleared cannot freeze the Ace for ever', async () => {
  races = [bahrainAtSepang('completed'), singapore];
  // Two days after the race, with the window never cleared — a season-locked team is
  // never touched by the unlock sweep.
  jest.setSystemTime(new Date('2026-10-06T09:00:00Z'));
  useTeamStore.setState({ currentTeam: windowed('2026-10-04T09:00:00Z'), error: null } as never);

  await useTeamStore.getState().setAce('hadjar');
  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBe('hadjar');
});

test('the window does not consult isLocked, so clearing the lock mid-race buys nothing', async () => {
  races = [bahrainAtSepang('completed'), singapore];
  jest.setSystemTime(new Date('2026-10-04T14:00:00Z'));
  useTeamStore.setState({ currentTeam: windowed('2026-10-04T09:00:00Z', false), error: null } as never);

  await useTeamStore.getState().setAce('hadjar');
  expect(useTeamStore.getState().error).toBe(ACE_LOCKED);
  expect(useTeamStore.getState().currentTeam?.aceDriverId).toBeNull();
});
