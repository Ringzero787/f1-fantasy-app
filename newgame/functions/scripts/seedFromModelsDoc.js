// Seed ben_lines for a race from a MODELS_N.md doc (Ben's weekly model post).
//
// Parses the "Full output" markdown tables (Race O/U, Quali O/U, Constructor
// O/U) and writes ben_lines/{raceId}_{session} in the same entity shape the
// R11 (britain) model seeding produced:
//   predicted, predictedLo/Hi (doc bounds), line (band midpoint), sigma
//   (zone rule), under/overProbability (doc percents), withProbability
//   (in-band normal CDF), offered odds = 1 / (p × 1.047)  (~4.7% hold —
//   verified to reproduce britain's stored odds).
//
// Constructor tables are in AVG-finish space since MODELS_5; the app settles
// on the SUM of both drivers' positions (halved only for display), so avg
// values are doubled on write.
//
// Usage:
//   node seedFromModelsDoc.js --doc=/mnt/smb/share/tracklimits/MODELS_5.md \
//     --race=hungary_2026 [--source=ben_model_R13] [--sprint] [--write]
//   (dry-run prints the docs without --write)
//
// --sprint additionally writes {raceId}_sprint with the same entities as the
// race doc: the model publishes no sprint-specific lines (sprint O/U output
// is identical to race O/U per MODELS spec), matching how britain R11 was
// seeded.

const fs = require('fs');
const admin = require('../node_modules/firebase-admin');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
if (!args.doc || !args.race) {
  console.error('Usage: node seedFromModelsDoc.js --doc=<path> --race=<raceId> [--source=<tag>] [--write]');
  process.exit(1);
}

const HOLD = 1.047;
const md = fs.readFileSync(args.doc, 'utf8');
const lines = md.split('\n');

const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
const zoneSigma = (pred) => (pred < 7.5 ? 2.0 : pred < 14.5 ? 5.0 : 2.0);
const round2 = (x) => Math.round(x * 100) / 100;
const offered = (p) => round2(1 / (p * HOLD));

// Grab the markdown table that follows the section heading matching `re`.
function tableAfter(re) {
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) throw new Error('section not found: ' + re);
  const rows = [];
  let inTable = false;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('|')) {
      inTable = true;
      const cells = l.split('|').map((c) => c.replace(/\*/g, '').trim()).filter((c) => c.length);
      if (!/^-|^:|^Rk/.test(cells[0])) rows.push(cells);
    } else if (inTable) break;
  }
  return rows;
}

const pct = (s) => parseInt(s, 10) / 100;
const pos = (s) => parseInt(String(s).replace(/^P/, ''), 10);
const ouLine = (s) => parseFloat(String(s).replace(/^O\/U\s*/, ''));

function driverEntity(row, session) {
  const [_, id, predS, lineS, underS, __, overS, ___, upS, loS] = row;
  const predicted = parseFloat(predS);
  const lo = pos(upS);
  const hi = pos(loS);
  const sigma = zoneSigma(predicted);
  const withP = phi((hi + 0.5 - predicted) / sigma) - phi((lo - 0.5 - predicted) / sigma);
  return [id, {
    entityId: id,
    entityKind: 'driver',
    predicted,
    line: Math.round((lo + hi) / 2),
    ouLine: ouLine(lineS),
    predictedLo: lo,
    predictedHi: hi,
    sigma,
    underProbability: pct(underS),
    overProbability: pct(overS),
    withProbability: round2(withP),
    againstProbability: round2(1 - withP),
    withOdds: offered(withP),
    againstOdds: offered(1 - withP),
  }];
}

function constructorEntity(row, driverSigmaByName) {
  const [_, id, driversS, avgS, lineS, underS, __, overS, ___, upS, loS] = row;
  const names = driversS.split('+').map((s) => s.trim());
  const [s1, s2] = names.map((n) => driverSigmaByName[n] ?? 5.0);
  const rho = 0.3;
  const sigmaSum = Math.sqrt(s1 * s1 + s2 * s2 + 2 * rho * s1 * s2); // = 2 × σ_avg
  const predicted = round2(2 * parseFloat(avgS));
  const lo = 2 * pos(upS);
  const hi = 2 * pos(loS);
  const withP = phi((hi + 0.5 - predicted) / sigmaSum) - phi((lo - 0.5 - predicted) / sigmaSum);
  return [id, {
    entityId: id,
    entityKind: 'constructor',
    predicted,
    line: Math.round((lo + hi) / 2),
    ouLine: 2 * ouLine(lineS),
    predictedLo: lo,
    predictedHi: hi,
    sigma: round2(sigmaSum),
    underProbability: pct(underS),
    overProbability: pct(overS),
    withProbability: round2(withP),
    againstProbability: round2(1 - withP),
    withOdds: offered(withP),
    againstOdds: offered(1 - withP),
  }];
}

// ---- parse ----
const raceRows = tableAfter(/^## Race O\/U Table/);
const qualiRows = tableAfter(/Full output .*n=8 window/);
const ctorRows = tableAfter(/^## Constructor O\/U/);

const raceEntities = Object.fromEntries(raceRows.map((r) => driverEntity(r, 'race')));
const qualiEntities = Object.fromEntries(qualiRows.map((r) => driverEntity(r, 'qualifying')));
const driverSigmaByName = Object.fromEntries(
  Object.values(raceEntities).map((e) => [e.entityId, e.sigma])
);
for (const r of ctorRows) {
  const [id, ent] = constructorEntity(r, driverSigmaByName);
  raceEntities[id] = ent;
}

console.log(`race: ${Object.keys(raceEntities).length} entities (incl. ${ctorRows.length} constructors)`);
console.log(`qualifying: ${Object.keys(qualiEntities).length} entities`);
console.log('sample race driver:', JSON.stringify(raceEntities[raceRows[0][1]]));
console.log('sample constructor:', JSON.stringify(raceEntities[ctorRows[0][1]]));
console.log('sample quali driver:', JSON.stringify(qualiEntities[qualiRows[0][1]]));

if (!args.write) {
  console.log('\nDRY RUN — pass --write to seed Firestore');
  process.exit(0);
}

admin.initializeApp({ projectId: 'f1-app-18077' });
const db = admin.firestore();
(async () => {
  const source = args.source ?? 'ben_model_doc';
  const sessions = [['race', raceEntities], ['qualifying', qualiEntities]];
  if (args.sprint) sessions.push(['sprint', raceEntities]);
  for (const [session, entities] of sessions) {
    await db.doc(`ben_lines/${args.race}_${session}`).set(
      {
        raceId: args.race,
        session,
        entities,
        posted: true,
        sourceFile: source,
        postedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`wrote ben_lines/${args.race}_${session} (${Object.keys(entities).length} entities)`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
