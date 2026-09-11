// Set Ben's best bets on ben_lines/{race}_race — the tl-best-bets aidlc op.
//
// Usage (from newgame/functions):
//   node scripts/setBestBets.js --race=madrid_2026 --picks=hamilton:P2-P5,sainz:O14.5 [--write]
// Dry-run by default: prints every entity it changes, before → after.
//
// Calls. Constructor calls are Ben's per-car average; they are stored doubled,
// as the SUM of both cars' positions that settlement grades.
//   P<lo>-P<hi>  lands in this range (in-range call; the pill shows the range)
//   O<n.5>       over:  drivers n+½..22, constructors 2n+1..44
//   U<n.5>       under: drivers 1..n−½,  constructors 3..2n−1
// Every best bet is priced 1.90 / 1.90. A current best bet missing from
// --picks goes back to its model line: range from ouLine (±1.5 per car), odds
// from the stored model probability at the model's 4.7% hold.
// Refuses once the race has locked: settlement grades already-placed picks
// against whatever the doc says at settle time. --after-lock="<reason>"
// overrides, and the reason lands in the operation's log.

const FIELD_SIZE = 22;
const BEST_BET_ODDS = 1.9;
const { offered } = require('./_pricing'); // same capped pricing as seedFromModelsDoc

// Entity ids become Firestore field paths (entities.<id>.<field>), so only the
// plain ids the app uses are accepted — a dot would address a nested field.
function parsePicks(s) {
  return String(s).split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf(':');
    if (i < 1) throw new Error(`pick "${x}": use <entityId>:<call>, e.g. hamilton:P2-P5`);
    const id = x.slice(0, i);
    if (!/^[a-z0-9_]+$/.test(id)) throw new Error(`pick "${x}": entity ids are lowercase letters, digits and _`);
    return { id, call: x.slice(i + 1).replace(/\s+/g, '') };
  });
}

// Call → stored range (SUM space for constructors) and the pill label.
function rangeFor(call, isCtor) {
  const scale = isCtor ? 2 : 1;
  let m = call.match(/^P(\d+)-P?(\d+)$/i);
  if (m) {
    const lo = Number(m[1]), hi = Number(m[2]);
    if (lo > hi) throw new Error(`call "${call}" is inverted`);
    return { lo: lo * scale, hi: hi * scale, benCall: null };
  }
  m = call.match(/^([OU])(\d+\.5)$/i);
  if (m) {
    const side = m[1].toUpperCase();
    const x = Number(m[2]) * scale;
    const benCall = `${side} ${m[2]}`;
    if (side === 'O') return { lo: Math.floor(x) + 1, hi: FIELD_SIZE * scale, benCall };
    return { lo: isCtor ? 3 : 1, hi: Math.ceil(x) - 1, benCall };
  }
  throw new Error(`call "${call}": use P<lo>-P<hi>, O<n.5> or U<n.5>`);
}

// The model line a best bet replaced, rebuilt from fields seedFromModelsDoc stores.
function modelLine(e) {
  const withP = e.withProbability;
  const againstP = typeof e.againstProbability === 'number' ? e.againstProbability : 1 - withP;
  if (typeof e.ouLine !== 'number' || typeof withP !== 'number') {
    throw new Error(`${e.entityId}: no ouLine/withProbability to rebuild its model line from — include it in --picks or fix it by hand`);
  }
  const half = e.entityKind === 'constructor' ? 3 : 1.5;
  const lo = e.ouLine - half, hi = e.ouLine + half;
  return { predictedLo: lo, predictedHi: hi, line: Math.round((lo + hi) / 2), withOdds: offered(withP), againstOdds: offered(againstP) };
}

// When best bets stop being editable: the race session start (Timestamp or ISO string), or null.
function raceLockMillis(race) {
  const t = race?.schedule?.race;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t === 'string') return Date.parse(t) || null;
  return null;
}

// Throws unless best bets may change at `now`; returns the override reason when past lock.
function checkLock(lockAt, now, afterLock) {
  if (!lockAt || now <= lockAt) return null;
  const reason = typeof afterLock === 'string' ? afterLock.trim() : '';
  if (!reason) throw new Error(`the race locked at ${new Date(lockAt).toISOString()}; changing best bets now changes how already-placed picks settle (--after-lock="<reason>" overrides)`);
  return reason;
}

const show = (e) => `P${e.predictedLo}–P${e.predictedHi} ${e.withOdds}/${e.againstOdds}${e.bestBet ? ' ★' : ''}${e.benCall ? ` "${e.benCall}"` : ''}`;

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }));
  if (!args.race || !args.picks) throw new Error('usage: setBestBets.js --race=<raceId> --picks=<id>:<call>,… [--write] [--after-lock="<reason>"]');
  if (!/^[a-z0-9_]+$/.test(args.race)) throw new Error(`race id "${args.race}" is not a plain id`);
  const admin = require('../node_modules/firebase-admin');
  admin.initializeApp({ projectId: 'f1-app-18077' });
  const db = admin.firestore();
  const del = admin.firestore.FieldValue.delete();

  const race = (await db.doc(`races/${args.race}`).get()).data();
  if (!race) throw new Error(`races/${args.race} not found`);
  const lockAt = raceLockMillis(race);
  const overrideReason = checkLock(lockAt, Date.now(), args['after-lock']);
  if (overrideReason) console.log(`AFTER LOCK (race locked ${new Date(lockAt).toISOString()}): ${overrideReason}`);
  const ref = db.doc(`ben_lines/${args.race}_race`);
  const doc = (await ref.get()).data();
  if (!doc?.entities || !Object.keys(doc.entities).length) throw new Error(`no race lines posted for ${args.race} — run tl-lines-seed first`);

  const picks = parsePicks(args.picks);
  const upd = { bestBetsSource: 'manual', updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  const rows = [];
  for (const { id, call } of picks) {
    const e = doc.entities[id];
    if (!e) throw new Error(`${id} has no line in ${args.race}_race`);
    const r = rangeFor(call, e.entityKind === 'constructor');
    const after = { predictedLo: r.lo, predictedHi: r.hi, withOdds: BEST_BET_ODDS, againstOdds: BEST_BET_ODDS, bestBet: true, benCall: r.benCall };
    for (const [k, v] of Object.entries(after)) upd[`entities.${id}.${k}`] = v === null ? del : v;
    rows.push([id, show(e), show({ ...after, benCall: r.benCall || undefined }), `best bet ${call}`]);
  }
  for (const e of Object.values(doc.entities)) {
    if (!e.bestBet || picks.some((p) => p.id === e.entityId)) continue;
    if (!/^[a-z0-9_]+$/.test(e.entityId)) throw new Error(`current best bet "${e.entityId}" has an id that cannot be updated safely — fix it by hand`);
    const m = modelLine(e);
    for (const [k, v] of Object.entries(m)) upd[`entities.${e.entityId}.${k}`] = v;
    upd[`entities.${e.entityId}.bestBet`] = del;
    upd[`entities.${e.entityId}.benCall`] = del;
    rows.push([e.entityId, show(e), show(m), 'back to model line']);
  }

  console.log(`${args.race}_race (${doc.sourceFile || 'unknown source'})${picks.length === 3 ? '' : ` — note: ${picks.length} best bet(s), the app promises 3`}`);
  for (const [id, before, after, why] of rows) console.log(`  ${id.padEnd(14)} ${before.padEnd(30)} → ${after.padEnd(30)} ${why}`);
  if (!args.write) { console.log('\nDRY RUN — pass --write to apply'); return; }
  await ref.update(upd);
  console.log(`\nwrote ben_lines/${args.race}_race: ${picks.length} best bet(s), ${rows.length - picks.length} reverted`);
}

module.exports = { parsePicks, rangeFor, modelLine, raceLockMillis, checkLock };

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error(`setBestBets: ${e.message}`); process.exit(1); });
}
