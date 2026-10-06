// Seed moonshotModels/{raceId} from a MODELS_N.md document (Ben's weekly model post), F-106.
//
// Parses the "Race O/U Table" (driver, predicted finish), turns each predicted finish into a
// finishing-position distribution (functions/src/moonshot/distribution.ts: zone-rule sigma,
// discretised normal, balanced so every position is taken once) and writes the document the
// Moonshot quote prices from. Dry-run by default: prints every driver's WIN / PODIUM / TOP 5
// chance and the multiplier the current config would offer, and flags drivers the game does not
// know or that the table is missing. `--write` writes.
//
// Usage (normally through the uc-moonshot-model-seed aidlc op kind):
//   node seedMoonshotModel.js --doc=/mnt/smb/share/tracklimits/MODELS_10.md --race=singapore_2026 [--source=ben_model_R19] [--write]
//
// A race with no document of its own needs no seeding: the quote carries the latest earlier
// round's model forward and says so.
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { parseRaceTable, buildModel } = require('../lib/moonshot/models.js');
const { predictionProbability } = require('../lib/moonshot/distribution.js');
const { price } = require('../lib/moonshot/pricing.js');
const { mergeConfig } = require('../lib/moonshot/config.js');

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
if (!args.doc || !args.race) { console.error('Usage: node seedMoonshotModel.js --doc=<path> --race=<raceId> [--source=<tag>] [--write]'); process.exit(1); }
if (!/^[a-z0-9_]+$/.test(args.race)) throw new Error(`race id "${args.race}" is not a plain id`);

if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'f1-app-18077' });
const db = admin.firestore();

(async () => {
  const md = fs.readFileSync(args.doc, 'utf8');
  const rows = parseRaceTable(md);
  const race = await db.doc(`races/${args.race}`).get();
  if (!race.exists) throw new Error(`races/${args.race} not found`);
  const r = race.data();
  const season = String(r.seasonId ?? '2026');
  const known = new Set((await db.collection('drivers').get()).docs.map((d) => d.id));
  const source = typeof args.source === 'string' ? args.source : `ben_model_R${r.round}`;
  const modelVersion = `${source}:${path.basename(args.doc)}`;
  const { model, unknown, missing } = buildModel(rows, { raceId: args.race, season, round: r.round, source, modelVersion }, known);
  const cfg = mergeConfig((await db.doc('config/app').get()).data()?.moonshot);

  console.log(`== ${args.race} (round ${r.round}) from ${path.basename(args.doc)} — ${rows.length} drivers, pricing ${cfg.pricing.mode}`);
  const ids = Object.keys(model.drivers).sort((a, b) => model.drivers[a].predicted - model.drivers[b].predicted);
  console.log('driver        pred   WIN              PODIUM           TOP 5');
  for (const id of ids) {
    const d = model.drivers[id];
    const cell = (t) => { const p = predictionProbability(d.positions, t); const pr = price(p, cfg.pricing); return `${(p * 100).toFixed(1).padStart(5)}% ${pr.band.padEnd(8)} ${String(pr.multiplier).padStart(4)}×`; };
    console.log(`${id.padEnd(13)} ${d.predicted.toFixed(2).padStart(5)}  ${cell('WIN')}  ${cell('PODIUM')}  ${cell('TOP_5')}`);
  }
  if (unknown.length) console.warn(`!! drivers in the table the game does not know: ${unknown.join(', ')}`);
  if (missing.length) console.warn(`!! game drivers missing from the table: ${missing.join(', ')}`);
  // every position is taken once: each column sums to one
  const n = model.positionsCount; const colSums = Array.from({ length: n }, (_, k) => ids.reduce((a, id) => a + model.drivers[id].positions[k], 0));
  console.log(`column sums min ${Math.min(...colSums).toFixed(3)} max ${Math.max(...colSums).toFixed(3)} (each should be 1.000)`);

  if (!args.write) { console.log('== dry run: nothing written (add --write)'); return; }
  if (unknown.length) throw new Error('refusing to write a model with unknown drivers');
  await db.doc(`moonshotModels/${args.race}`).set({ ...model, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  console.log(`== wrote moonshotModels/${args.race}`);
})().catch((e) => { console.error(e.message); process.exit(1); });
