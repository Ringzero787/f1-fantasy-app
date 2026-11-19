/**
 * F-154: where a season rollover run connects, decided from its command line and environment. Pure,
 * so the rehearsal switch is tested rather than trusted (functions/test/seasonRollover.test.js);
 * functions/scripts/seasonRollover.js applies the decision.
 *
 *  - production: the service-account key is loaded and must be for f1-app-18077; refused while
 *    FIRESTORE_EMULATOR_HOST is set, since the Admin SDK would then quietly talk to an emulator.
 *  - rehearsal (`--emulator=HOST:PORT`): loopback only, and the key is never loaded, so nothing in
 *    the run can authenticate to production. `--fail-after=N` (rehearsal only) dies after N groups.
 */
export const EXPECTED_PROJECT = 'f1-app-18077';

export interface Connection {
  apply: boolean;
  failAfter: number | null;
  pathsOut: string | null;
  pathsCheck: string | null;
  emulator: string | null;
  useKey: boolean;
}

const FLAGS = ['--apply', '--paths-out', '--paths-check', '--emulator', '--fail-after'];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Parse the command line and decide where this run connects. Pure (argv and env in, a decision or a
 * refusal out), so the rehearsal switch is tested, not trusted.
 */
export function connectionFor(argv: string[], env: Record<string, string | undefined>): Connection | { error: string } {
  const flags: Record<string, string | true> = {};
  for (const a of argv) {
    const m = a.match(/^(--[a-z-]+)(?:=(.*))?$/);
    if (!m || !FLAGS.includes(m[1])) return { error: `"${a}" is not a flag this script understands. Nothing was written.` };
    if (m[1] in flags) return { error: `${m[1]} given twice. Nothing was written.` };
    flags[m[1]] = m[2] === undefined ? true : m[2];
  }
  for (const f of ['--paths-out', '--paths-check', '--emulator', '--fail-after']) {
    if (f in flags && (flags[f] === true || flags[f] === '')) return { error: `${f} needs a value (${f}=…). Nothing was written.` };
  }
  const apply = flags['--apply'] === true;
  if ('--apply' in flags && flags['--apply'] !== true) return { error: '--apply takes no value. Nothing was written.' };
  if (flags['--paths-out'] && apply) return { error: '--paths-out belongs to the dry run; the apply checks with --paths-check.' };
  let failAfter = null;
  if ('--fail-after' in flags) {
    if (!flags['--emulator']) return { error: '--fail-after is for rehearsals and needs --emulator.' };
    if (!/^\d+$/.test(String(flags['--fail-after']))) return { error: '--fail-after must be a whole number of groups.' };
    failAfter = Number(flags['--fail-after']);
  }
  if (flags['--emulator']) {
    const m = String(flags['--emulator']).match(/^(127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/);
    if (!m || !LOOPBACK.has(m[1])) return { error: `--emulator must be a loopback HOST:PORT (127.0.0.1:8080), not ${JSON.stringify(flags['--emulator'])}.` };
    return { apply, failAfter, pathsOut: (flags['--paths-out'] as string) || null, pathsCheck: (flags['--paths-check'] as string) || null, emulator: String(flags['--emulator']), useKey: false };
  }
  // A production run with the emulator variable set would read and write the emulator while
  // reporting the production project — or, the other way round, a rehearsal that forgot
  // --emulator would reach production. Neither is allowed to guess.
  if (env.FIRESTORE_EMULATOR_HOST) return { error: `FIRESTORE_EMULATOR_HOST is set (${env.FIRESTORE_EMULATOR_HOST}) without --emulator. Unset it for production, or pass --emulator=${env.FIRESTORE_EMULATOR_HOST} to rehearse.` };
  return { apply, failAfter: null, pathsOut: (flags['--paths-out'] as string) || null, pathsCheck: (flags['--paths-check'] as string) || null, emulator: null, useKey: true };
}
