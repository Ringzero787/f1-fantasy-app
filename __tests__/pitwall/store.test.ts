/**
 * The store is where the pass and the projections meet, so its refresh rules are worth testing:
 * no read without a pass, a forced refresh is never dropped, and an overtaken run cannot write a
 * stale answer over a newer one.
 */
const loadPass = jest.fn();
const loadProjections = jest.fn();
jest.mock('../../src/pitwall/client', () => ({ loadPass, loadProjections, portalUrl: jest.fn() }));

import { usePitWallStore } from '../../src/store/pitwall.store';
import { NO_PASS } from '../../src/pitwall/pass';

const PASS = { active: true, expiresAt: Date.now() + 86400000 };
const SET = { round: 17, asOf: '2026-09-24T19:00:00.000Z', byId: { stone: { id: 'stone', med: 58, floor: 46, ceil: 73, dnf: 13, ptsRise: 5 } } };
const defer = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  loadPass.mockReset();
  loadProjections.mockReset();
  usePitWallStore.setState({ pass: NO_PASS, projections: null, loading: false });
});

it('reads the projections only for a pass holder', async () => {
  loadPass.mockResolvedValue(PASS);
  loadProjections.mockResolvedValue(SET);
  await usePitWallStore.getState().refresh();
  expect(usePitWallStore.getState().projectionFor('stone')?.med).toBe(58);
  expect(loadProjections).toHaveBeenCalledTimes(1);
});

it('does not ask for a document the rules would refuse', async () => {
  loadPass.mockResolvedValue(NO_PASS);
  await usePitWallStore.getState().refresh();
  expect(loadProjections).not.toHaveBeenCalled();
  expect(usePitWallStore.getState().projectionFor('stone')).toBeNull();
});

it('never drops a forced refresh, which is the one that follows a purchase', async () => {
  const slow = defer<typeof NO_PASS>();
  loadPass.mockReturnValueOnce(slow.promise);
  const first = usePitWallStore.getState().refresh();          // in flight, token not forced
  loadPass.mockResolvedValue(PASS);
  loadProjections.mockResolvedValue(SET);
  await usePitWallStore.getState().refresh(true);              // must not be skipped
  slow.resolve(NO_PASS);
  await first;
  expect(loadPass).toHaveBeenLastCalledWith(true);
  expect(usePitWallStore.getState().pass.active).toBe(true);
});

it('keeps a pass hidden while it is not active, whatever arrives late', async () => {
  loadPass.mockResolvedValue(PASS);
  loadProjections.mockResolvedValue(SET);
  await usePitWallStore.getState().refresh();
  usePitWallStore.getState().clear();
  expect(usePitWallStore.getState().pass).toEqual(NO_PASS);
  expect(usePitWallStore.getState().projectionFor('stone')).toBeNull();
});

it('holds nothing when the read fails', async () => {
  loadPass.mockRejectedValue(new Error('offline'));
  await usePitWallStore.getState().refresh();
  expect(usePitWallStore.getState().pass).toEqual(NO_PASS);
  expect(usePitWallStore.getState().projections).toBeNull();
});
