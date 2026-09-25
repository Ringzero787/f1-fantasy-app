/**
 * Run the projections job against production. READ-ONLY unless --apply is given.
 *
 *   SA_KEY=… node dist/workers/pitwall/src/cli/project.js [--apply] [--session=fp1] [--season=2026]
 *
 * Reads only the collections in model/inputs.ts (ADR-001). With --apply it writes the two payload
 * documents and one projection snapshot, all in pw_* collections that no client can touch.
 */
import { runProjections } from '../jobs/projections';

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).split('=')[1];
const apply = args.includes('--apply');
const season = flag('season', '2026');
const sessionKey = flag('session', 'daily');

const EXPECTED_PROJECT = 'f1-app-18077';
const key = process.env.SA_KEY;
if (!key) { console.error('SA_KEY must point at the service-account key (aidlc op loads it from ~/.config/aidlc/env).'); process.exit(2); }
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cred = require(key) as { project_id: string };
if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
// firebase-admin lives in functions/node_modules; the worker keeps no dependency of its own.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require(require.resolve('firebase-admin', { paths: ['/data/f1-app/functions/node_modules'] }));
admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });

(async () => {
  const run = await runProjections(admin.firestore(), { season, sessionKey, apply });
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} · season ${run.season} round ${run.round} (${run.raceId}) · session ${run.sessionKey}`);
  console.log(`${run.counts.pastRaces} completed races used · ${run.counts.drivers} drivers · ${run.counts.constructors} constructors\n`);
  const drivers = run.projections.filter((p) => p.entityType === 'driver').sort((a, b) => b.median - a.median);
  console.log('DRIVER        FLOOR   MED  CEIL   WIN  PODIUM  TOP10   DNF   d$');
  for (const p of drivers) console.log(`${p.entityId.padEnd(12)} ${pad(p.floor.toFixed(0), 5)} ${pad(p.median.toFixed(0), 5)} ${pad(p.ceiling.toFixed(0), 5)} ${pad((p.pWin * 100).toFixed(0) + '%', 5)} ${pad((p.pPodium * 100).toFixed(0) + '%', 7)} ${pad((p.pTop10 * 100).toFixed(0) + '%', 6)} ${pad((p.pDnf * 100).toFixed(0) + '%', 5)} ${pad(p.expectedPriceChange.toFixed(0), 4)}`);
  const ctors = run.projections.filter((p) => p.entityType === 'constructor').sort((a, b) => b.median - a.median);
  console.log('\nCONSTRUCTOR   FLOOR   MED  CEIL   d$');
  for (const p of ctors) console.log(`${p.entityId.padEnd(12)} ${pad(p.floor.toFixed(0), 5)} ${pad(p.median.toFixed(0), 5)} ${pad(p.ceiling.toFixed(0), 5)} ${pad(p.expectedPriceChange.toFixed(0), 4)}`);
  console.log(run.weather.length ? '\nWEATHER       SKY            TEMP   RAIN   WIND' : '\nWEATHER: none for this round (no forecast within range, or no coordinates)');
  for (const w of run.weather) console.log(`${w.label.padEnd(13)} ${(w.sky ?? '—').padEnd(14)} ${pad(w.tempC === null ? '—' : `${w.tempC}°`, 5)} ${pad(w.rainMm === null ? '—' : `${w.rainMm}mm`, 6)} ${pad(w.windKph === null ? '—' : `${w.windKph}kph`, 6)}`);
  console.log(run.wrote.length ? `\nWrote: ${run.wrote.join(', ')}` : '\nNothing was written.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
