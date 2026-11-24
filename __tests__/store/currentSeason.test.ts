/**
 * F-157: the store's season. The bundled demo calendar is 2026 data and must never decide the season;
 * a pin from config/app wins; with neither, the documented last resort.
 */
jest.mock('../../src/config/firebase', () => ({ db: {}, firebaseAuth: { currentUser: null } }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn() }));
jest.mock('../../src/services/remoteConfig.service', () => ({
  remoteConfigService: { getDefaults: () => ({}), fetchAll: jest.fn() },
}));

import { selectCurrentSeasonId } from '../../src/store/remoteConfig.store';
import { LAST_RESORT_SEASON_ID } from '../../src/utils/season';
import type { Race } from '../../src/types';

const races = [
  { id: 'abu_dhabi_2026', seasonId: '2026', status: 'completed', schedule: { race: new Date('2026-12-06T13:00:00Z') } },
  { id: 'australia_2027', seasonId: '2027', status: 'completed', schedule: { race: new Date('2027-03-14T05:00:00Z') } },
] as unknown as Race[];
const appConfig = (currentSeason?: unknown) => ({ minVersion: null, latestVersion: null, updateMessage: null, androidUrl: null, iosUrl: null, currentSeason: currentSeason as string });
const now = new Date('2027-03-20T00:00:00Z').getTime();

describe('selectCurrentSeasonId', () => {
  it('live calendar decides when nothing is pinned', () => {
    expect(selectCurrentSeasonId({ races, racesLive: true, appConfig: appConfig() }, now)).toBe('2027');
  });

  it('the bundled (demo) calendar is ignored: last resort, not its year', () => {
    expect(selectCurrentSeasonId({ races, racesLive: false, appConfig: appConfig() }, now)).toBe(LAST_RESORT_SEASON_ID);
  });

  it('a pin wins, even signed in with the demo calendar', () => {
    expect(selectCurrentSeasonId({ races, racesLive: false, appConfig: appConfig('2028') }, now)).toBe('2028');
  });

  it('config/app unreadable (signed out): the live calendar still answers', () => {
    expect(selectCurrentSeasonId({ races, racesLive: true, appConfig: appConfig(null) }, now)).toBe('2027');
  });
});
