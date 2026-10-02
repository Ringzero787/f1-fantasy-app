/**
 * Collects sign-in handoff records nobody came back for (F-091).
 *
 * A claimed record deletes itself and an expired one is deleted on the attempt, so what is left
 * here is the sign-in abandoned at the consent screen — dead after ten minutes, but still a
 * document. Mirrors `cleanupHandoffs` on the Pit Wall side.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sweepAuthHandoffs } from './handoffStore';

export const cleanupAuthHandoffs = onSchedule('every 24 hours', async () => {
  console.log('[auth] deleted', await sweepAuthHandoffs(Date.now()), 'stale sign-in handoff rows');
});
