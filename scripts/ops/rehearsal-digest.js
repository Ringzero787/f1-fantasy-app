// F-154: the season rollover rehearsal's state check — the counts the F-150 runbook expects after a
// run, and a digest of every document the rollover can touch (timestamps reduced to "TS"), so two
// states can be compared exactly: before an apply and after its rollback, or a full run and a run
// that stopped halfway and was finished.
// Usage: node scripts/ops/rehearsal-digest.js --emulator=HOST:PORT   (emulator only; prints one JSON line)
const { firestoreTarget } = require('./_paths');
const t = firestoreTarget(process.argv.slice(2), process.env);
if (t.error || t.target !== 'emulator') { console.error(t.error || 'pass --emulator=HOST:PORT: the digest is for rehearsals only.'); process.exit(2); }
const { db } = require('./_firestore');
const crypto = require('crypto');
const strip = (v) => {
  if (v && typeof v.toMillis === 'function') return 'TS';
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, strip(v[k])]));
  return v;
};
(async () => {
  const all = {};
  const grab = async (q) => { for (const d of (await q.get()).docs) all[d.ref.path] = strip(d.data()); };
  for (const c of ['fantasyTeams', 'leagues', 'drivers', 'constructors', 'races', 'seasons']) await grab(db.collection(c));
  await grab(db.collectionGroup('members')); await grab(db.collectionGroup('seasons'));
  const cfg = await db.doc('config/app').get();
  if (cfg.exists) all['config/app'] = strip(cfg.data());
  const teams = Object.entries(all).filter(([p]) => /^fantasyTeams\/[^/]+$/.test(p));
  const leagues = Object.entries(all).filter(([p]) => /^leagues\/[^/]+$/.test(p));
  const tArch = Object.keys(all).filter((p) => /^fantasyTeams\/[^/]+\/seasons\/2026$/.test(p)).length;
  const lArch = Object.keys(all).filter((p) => /^leagues\/[^/]+\/seasons\/2026$/.test(p)).length;
  const reset = teams.filter(([, t]) => t.budget === 1000 && Array.isArray(t.drivers) && t.drivers.length === 0 && t.totalPoints === 0 && t.lockedPoints === 0 && t.constructor === null).length;
  const members = Object.entries(all).filter(([p]) => /^leagues\/[^/]+\/members\//.test(p));
  const zeroed = members.filter(([, m]) => m.totalPoints === 0).length;
  const ents = Object.entries(all).filter(([p]) => /^(drivers|constructors)\//.test(p));
  const priced = ents.filter(([, e]) => e.pricedFor === '2027' && e.fantasyPoints === 0).length;
  const r27 = Object.keys(all).filter((p) => /^races\/.*_2027$/.test(p)).length;
  const s = {
    teams: teams.length, teamsReset: reset, teamArchives: tArch,
    leagues: leagues.length, leaguesOn2027: leagues.filter(([, l]) => l.seasonId === '2027').length, leagueArchives: lArch,
    members: members.length, membersZeroed: zeroed,
    entities: ents.length, priced2027: priced, races2027: r27,
    currentSeason: all['config/app']?.currentSeason, rolledOver: !!all['seasons/2026']?.rolledOverAt,
    // fields no reset may leave behind (rehearsal-doctor.js --hostile-fields plants them)
    oddFieldTeams: teams.filter(([, t]) => Object.keys(t).some((k) => /[.*~\[\]]/.test(k))).length,
  };
  const digest = crypto.createHash('sha256').update(JSON.stringify(Object.keys(all).sort().map((k) => [k, all[k]]))).digest('hex').slice(0, 16);
  console.log(JSON.stringify({ ...s, docs: Object.keys(all).length, digest }));
})().then(() => process.exit(0));
