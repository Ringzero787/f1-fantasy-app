/**
 * F-045: roster edits paint immediately and adopt the team the callable
 * returns, instead of a spinner + two follow-up reads.
 *
 * Before: addDriver flipped isLoading (which the My Team screen renders as a
 * full-screen spinner), awaited the callable, then getTeamById twice. Now it
 * flips isSavingRoster only, paints the optimistic row, and adopts the
 * callable's projected team. Constructor edits gained the same treatment.
 */

import type { FantasyTeam } from '../../src/types';

const addDriver = jest.fn();
const removeDriver = jest.fn();
const setConstructor = jest.fn();
const removeConstructor = jest.fn();
const getTeamById = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store.get(k) ?? null),
      setItem: jest.fn(async (k: string, v: string) => void store.set(k, v)),
      removeItem: jest.fn(async (k: string) => void store.delete(k)),
    },
  };
});
jest.mock('../../src/services/team.service', () => ({
  teamService: {
    addDriver: (...a: unknown[]) => addDriver(...a),
    removeDriver: (...a: unknown[]) => removeDriver(...a),
    setConstructor: (...a: unknown[]) => setConstructor(...a),
    removeConstructor: (...a: unknown[]) => removeConstructor(...a),
    getTeamById: (...a: unknown[]) => getTeamById(...a),
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
      getCompletedRaceCount: () => 14,
    }),
  },
}));

import { useTeamStore } from '../../src/store/team.store';

const driver = (id: string, price: number) => ({
  driverId: id,
  name: id,
  shortName: id.slice(0, 3).toUpperCase(),
  constructorId: 'x',
  purchasePrice: price,
  currentPrice: price,
  pointsScored: 0,
  racesHeld: 1,
  contractLength: 3,
  addedAtRace: 13,
});

const baseTeam = (): FantasyTeam =>
  ({
    id: 'T1',
    userId: 'u1',
    leagueId: 'L1',
    name: 'Team',
    drivers: [driver('lawson', 202), driver('gasly', 178)],
    constructor: { constructorId: 'audi', name: 'Audi', purchasePrice: 156, currentPrice: 156, pointsScored: 0, racesHeld: 1, contractLength: 3 },
    budget: 464,
    totalSpent: 536,
    totalPoints: 100,
    lockedPoints: 0,
    aceDriverId: null,
    racesSinceTransfer: 2,
    isLocked: false,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  }) as unknown as FantasyTeam;

const reset = () =>
  useTeamStore.setState({
    currentTeam: baseTeam(),
    userTeams: [baseTeam()],
    isLoading: false,
    isSavingRoster: false,
    error: null,
  });

/** Records every state the store passes through while an action runs. */
const trace = () => {
  const seen: Array<{ isLoading: boolean; isSavingRoster: boolean; drivers: string[]; ctor: string | null; budget: number }> = [];
  const unsub = useTeamStore.subscribe((s) => {
    seen.push({
      isLoading: s.isLoading,
      isSavingRoster: s.isSavingRoster,
      drivers: (s.currentTeam?.drivers ?? []).map((d) => d.driverId),
      ctor: s.currentTeam?.constructor?.constructorId ?? null,
      budget: s.currentTeam?.budget ?? -1,
    });
  });
  return { seen, stop: unsub };
};

beforeEach(() => {
  [addDriver, removeDriver, setConstructor, removeConstructor, getTeamById].forEach((m) => m.mockReset());
  reset();
});

describe('addDriver', () => {
  it('paints the row at once, never flips the full-screen spinner, and adopts the returned team', async () => {
    const returned = { ...baseTeam(), drivers: [...baseTeam().drivers, driver('hadjar', 89)], budget: 375, totalSpent: 625, racesSinceTransfer: 0 };
    let rowsWhenServerCalled: string[] = [];
    addDriver.mockImplementation(async () => {
      rowsWhenServerCalled = useTeamStore.getState().currentTeam!.drivers.map((d) => d.driverId);
      return returned;
    });
    const t = trace();

    await useTeamStore.getState().addDriver('hadjar', 3, { id: 'hadjar', name: 'Isack Hadjar', shortName: 'HAD', constructorId: 'red_bull', price: 89 });
    t.stop();

    expect(rowsWhenServerCalled).toEqual(['lawson', 'gasly', 'hadjar']); // optimistic before the callable resolved
    expect(t.seen.some((s) => s.isLoading)).toBe(false); // no spinner
    expect(t.seen.some((s) => s.isSavingRoster)).toBe(true); // but the in-flight flag was raised
    const final = useTeamStore.getState();
    expect(final.isSavingRoster).toBe(false);
    expect(final.currentTeam!.budget).toBe(375); // the server's number, not a guess
    expect(final.userTeams[0].budget).toBe(375);
    expect(getTeamById).not.toHaveBeenCalled(); // no follow-up read
  });

  it('rolls the optimistic row back when the server refuses', async () => {
    addDriver.mockRejectedValue(new Error('Cannot afford'));

    await useTeamStore.getState().addDriver('norris', 3, { id: 'norris', name: 'Lando Norris', shortName: 'NOR', constructorId: 'mclaren', price: 591 });

    const s = useTeamStore.getState();
    expect(s.currentTeam!.drivers.map((d) => d.driverId)).toEqual(['lawson', 'gasly']);
    expect(s.error).toBe('Cannot afford');
    expect(s.isSavingRoster).toBe(false);
    expect(s.isLoading).toBe(false);
  });
});

describe('removeDriver', () => {
  it('drops the row immediately and takes the bank from the server', async () => {
    const returned = { ...baseTeam(), drivers: [driver('lawson', 202)], budget: 630, lockedPoints: 40, totalPoints: 60 };
    let rowsWhenServerCalled: string[] = [];
    removeDriver.mockImplementation(async () => {
      rowsWhenServerCalled = useTeamStore.getState().currentTeam!.drivers.map((d) => d.driverId);
      return returned;
    });
    const t = trace();

    await useTeamStore.getState().removeDriver('gasly');
    t.stop();

    expect(rowsWhenServerCalled).toEqual(['lawson']); // gone before the callable resolved
    expect(t.seen.some((s) => s.isLoading)).toBe(false);
    expect(useTeamStore.getState().currentTeam!.budget).toBe(630);
    expect(getTeamById).not.toHaveBeenCalled();
  });
});

describe('constructor edits', () => {
  it('setConstructor swaps the slot optimistically and adopts the server team', async () => {
    const returned = { ...baseTeam(), constructor: { constructorId: 'racing_bulls', name: 'Racing Bulls', purchasePrice: 201, currentPrice: 201, pointsScored: 0, racesHeld: 0, contractLength: 3 }, budget: 419 };
    let ctorWhenServerCalled: string | null = null;
    setConstructor.mockImplementation(async () => {
      ctorWhenServerCalled = useTeamStore.getState().currentTeam!.constructor!.constructorId;
      return returned;
    });
    const t = trace();

    await useTeamStore.getState().setConstructor('racing_bulls', 3, { id: 'racing_bulls', name: 'Racing Bulls', price: 201 });
    t.stop();

    expect(ctorWhenServerCalled).toBe('racing_bulls');
    expect(t.seen.some((s) => s.isLoading)).toBe(false);
    expect(useTeamStore.getState().currentTeam!.budget).toBe(419);
    expect(getTeamById).not.toHaveBeenCalled();
  });

  it('setConstructor rolls back on failure', async () => {
    setConstructor.mockRejectedValue(new Error('Team is locked'));

    await useTeamStore.getState().setConstructor('mercedes', 3, { id: 'mercedes', name: 'Mercedes', price: 657 });

    const s = useTeamStore.getState();
    expect(s.currentTeam!.constructor!.constructorId).toBe('audi');
    expect(s.error).toBe('Team is locked');
    expect(s.isSavingRoster).toBe(false);
  });

  it('removeConstructor clears the slot optimistically and adopts the server team', async () => {
    const returned = { ...baseTeam(), constructor: null, budget: 620 };
    let ctorWhenServerCalled: string | null = 'unset';
    removeConstructor.mockImplementation(async () => {
      ctorWhenServerCalled = useTeamStore.getState().currentTeam!.constructor?.constructorId ?? null;
      return returned;
    });
    const t = trace();

    await useTeamStore.getState().removeConstructor();
    t.stop();

    expect(ctorWhenServerCalled).toBeNull();
    expect(t.seen.some((s) => s.isLoading)).toBe(false);
    expect(useTeamStore.getState().currentTeam!.budget).toBe(620);
  });

  it('removeConstructor rolls back on failure', async () => {
    removeConstructor.mockRejectedValue(new Error('Team is locked'));

    await useTeamStore.getState().removeConstructor();

    const s = useTeamStore.getState();
    expect(s.currentTeam!.constructor!.constructorId).toBe('audi');
    expect(s.userTeams[0].constructor!.constructorId).toBe('audi');
    expect(s.error).toBe('Team is locked');
    expect(s.isSavingRoster).toBe(false);
  });

  it('ignores a double tap while a constructor edit is in flight', async () => {
    let resolve: (t: FantasyTeam) => void = () => {};
    setConstructor.mockImplementation(() => new Promise<FantasyTeam>((r) => { resolve = r; }));

    const first = useTeamStore.getState().setConstructor('mercedes', 3, { id: 'mercedes', name: 'Mercedes', price: 657 });
    const second = useTeamStore.getState().setConstructor('ferrari', 3, { id: 'ferrari', name: 'Ferrari', price: 586 });
    await second;
    expect(setConstructor).toHaveBeenCalledTimes(1);
    resolve({ ...baseTeam(), constructor: { constructorId: 'mercedes' } } as unknown as FantasyTeam);
    await first;
    expect(useTeamStore.getState().currentTeam!.constructor!.constructorId).toBe('mercedes');
  });
});
