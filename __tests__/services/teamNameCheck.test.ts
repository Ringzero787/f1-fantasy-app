/**
 * F-059: team-name uniqueness is asked of the server (checkTeamNameAvailable),
 * never answered with a global fantasyTeams query from the client.
 */
const callables: Record<string, jest.Mock> = {};
const getDocs = jest.fn();
const addDoc = jest.fn();
const updateDoc = jest.fn();
const getDoc = jest.fn();

// team.service takes httpsCallable from the app's firebase config module.
jest.mock('../../src/config/firebase', () => ({
  db: {},
  functions: {},
  httpsCallable: (_f: unknown, name: string) => (...args: unknown[]) => callables[name](...args),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  query: jest.fn((...a: unknown[]) => ({ q: a })),
  where: jest.fn((...a: unknown[]) => ({ where: a })),
  limit: jest.fn((n: number) => ({ limit: n })),
  orderBy: jest.fn(),
  getDocs: (...a: unknown[]) => getDocs(...a),
  getDoc: (...a: unknown[]) => getDoc(...a),
  addDoc: (...a: unknown[]) => addDoc(...a),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'ts'),
  increment: jest.fn(),
  arrayUnion: jest.fn(),
  Timestamp: class {},
}));

import { teamService } from '../../src/services/team.service';

beforeEach(() => {
  jest.clearAllMocks();
  callables.checkTeamNameAvailable = jest.fn();
});

describe('team name availability', () => {
  it('createTeam asks the server and refuses a taken name without any team query', async () => {
    callables.checkTeamNameAvailable.mockResolvedValue({ data: { available: false } });
    await expect(teamService.createTeam('u1', null, 'Apex')).rejects.toThrow('A team with this name already exists');
    expect(callables.checkTeamNameAvailable).toHaveBeenCalledWith({ name: 'Apex' });
    expect(getDocs).not.toHaveBeenCalled();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('createTeam writes the team when the name is free', async () => {
    callables.checkTeamNameAvailable.mockResolvedValue({ data: { available: true } });
    addDoc.mockResolvedValue({ id: 'new-team' });
    const team = await teamService.createTeam('u1', null, 'Apex');
    expect(team.id).toBe('new-team');
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('updateTeamName excludes the team being renamed', async () => {
    getDoc.mockResolvedValue({ exists: () => true, id: 't1', data: () => ({ name: 'Old', userId: 'u1', drivers: [] }) });
    callables.checkTeamNameAvailable.mockResolvedValue({ data: { available: true } });
    await teamService.updateTeamName('t1', 'New Name');
    expect(callables.checkTeamNameAvailable).toHaveBeenCalledWith({ name: 'New Name', excludeTeamId: 't1' });
    expect(updateDoc).toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });
});
