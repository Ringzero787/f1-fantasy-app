import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Plan } from '../data/team';

/**
 * The Ace is the one step `executePlan` writes directly rather than through a callable,
 * so what that write contains is worth pinning (F-095):
 *
 *  - `aceConstructorId` goes with it. The portal has no constructor-ace UI, the app does,
 *    and the two are meant to be exclusive — writing only the driver half left teams with
 *    both set and `calculatePoints` doubling each.
 *  - a bare `permission-denied` becomes a sentence HERE, where it is clear which step was
 *    refused. A blanket branch in `saveErrorText` would have reported a revoked session on
 *    any other step as a race-start lock.
 */
const updateDoc = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('./firebase', () => ({
  callable: vi.fn(async () => async () => ({ data: {} })),
  firestore: async () => ({
    db: {},
    m: { updateDoc, doc: (...a: unknown[]) => a, serverTimestamp: () => 'TS' },
  }),
}));

const { executePlan, saveErrorText } = await import('./teamApi');
const emptyPlan: Plan = { steps: [], bankAfter: 0, blocked: null, changed: false };

beforeEach(() => { updateDoc.mockReset(); updateDoc.mockResolvedValue(undefined); });

describe('the portal ace write (F-095)', () => {
  it('clears the constructor ace alongside, so the two can never both be set', async () => {
    await executePlan('T1', emptyPlan, 'norris');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ aceDriverId: 'norris', aceConstructorId: null });
  });

  it('clears both when the ace is cleared', async () => {
    await executePlan('T1', emptyPlan, '');
    expect(updateDoc.mock.calls[0][1]).toMatchObject({ aceDriverId: null, aceConstructorId: null });
  });

  it('turns the rules refusal into a sentence, and leaves every other refusal alone', async () => {
    updateDoc.mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await expect(executePlan('T1', emptyPlan, 'norris')).rejects.toThrow(/your ace is set for this round/);

    updateDoc.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    await expect(executePlan('T1', emptyPlan, 'norris')).rejects.toThrow(/unavailable/);
  });

  it('saveErrorText passes the ace sentence through and does not invent one for other denials', () => {
    expect(saveErrorText(new Error('The race has started, so your ace is set for this round. Nothing more was changed.')))
      .toMatch(/your ace is set for this round/);
    expect(saveErrorText(Object.assign(new Error('Not your team'), { code: 'permission-denied' })))
      .not.toMatch(/race has started/);
  });
});
