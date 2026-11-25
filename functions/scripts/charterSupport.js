/**
 * Charter support and the sale flip (F-175 slice 5). Run through `aidlc op` (kinds uc-charter-support
 * and uc-charter-sale), never by hand on production.
 *
 *   --action=list                          every paid charter that did not apply, every live charter,
 *                                          and the sale switch. Reads only.
 *   --action=apply --ref=<id> [--league=]  charter the league a paid purchase was for, when it was
 *                                          recorded as not applied (charterApplied: false, or a
 *                                          charter_grants refusal). ref = the purchases/{id}, or
 *                                          stripe:pi_… for Stripe. The usual checks still hold (owner
 *                                          only, one per season, never after a refund); the sale flag
 *                                          does not, because the buyer has paid.
 *   --action=clear --league=<id> [--ref=]  take a league's charter back (after the money was refunded
 *                                          in the store console; or a test charter). With ref, only
 *                                          the charter that purchase paid for.
 *   --action=sale-on | sale-off            config/app.charter.enabled. sale-on first clears every
 *                                          live charter except support applies: before the flip, the
 *                                          only other way to charter is a test purchase.
 *
 * A refund itself is made in the store console (Play order management, Apple's reportaproblem, the
 * Stripe dashboard); the refund sweep, the App Store notification or the Stripe webhook then clears
 * the charter. `clear` is for when that path cannot (a refund made outside the store, a test).
 *
 * Dry run by default; --apply writes. --paths-out=FILE (dry run) writes every document the run can
 * touch, one per line, for the op's backup; --paths-check=FILE (apply) refuses unless every write is
 * in that list, so a member who joined since the dry run cannot escape the backup.
 */
const path = require('path');
const fs = require('fs');
const OPS = require('./lib/charterOps');

const EXPECTED_PROJECT = 'f1-app-18077';
// Nothing happens on import (scripts/seedGuards.test.js holds every op script to this).
let db;
let admin;
let store;
let saleSeason;
let charterEnabled;

function initAdmin() {
  admin = require('firebase-admin');
  const KEY = process.env.SA_KEY;
  if (!KEY) { console.error('SA_KEY must point at the service-account key (aidlc op loads it from ~/.config/aidlc/env).'); process.exit(2); }
  const cred = require(KEY);
  if (cred.project_id !== EXPECTED_PROJECT) { console.error(`Refusing to run: key is for project ${cred.project_id}, expected ${EXPECTED_PROJECT}.`); process.exit(2); }
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: EXPECTED_PROJECT });
  db = admin.firestore();
  store = require(path.join(__dirname, '..', 'lib', 'charter', 'charterStore.js'));
  ({ saleSeason } = require(path.join(__dirname, '..', 'lib', 'pitwall', 'pass.js')));
  ({ charterEnabled } = require(path.join(__dirname, '..', 'lib', 'charter', 'charter.js')));
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const opt = (name) => { const a = args.find((x) => x.startsWith(`--${name}=`)); const v = a ? a.split('=').slice(1).join('=') : ''; return v === '-' ? '' : v; };
const day = (ms) => (typeof ms === 'number' ? new Date(ms).toISOString().slice(0, 10) : '?');

/** Members of the league plus everyone whose charterAccess names it: who a grant or clear can touch. */
async function touchedUids(leagueId) {
  const holders = await db.collection('users').where(new admin.firestore.FieldPath('charterAccess', 'leagues', leagueId), '>', 0).get();
  const members = await db.collection(`leagues/${leagueId}/members`).get();
  // The owner gets access whether or not they have a member document (charterMemberIds).
  const ownerId = (await db.doc(`leagues/${leagueId}`).get()).data()?.ownerId;
  return [...new Set([...holders.docs.map((d) => d.id), ...members.docs.map((d) => d.id), ...(typeof ownerId === 'string' && ownerId ? [ownerId] : [])])];
}

/** Write or check the backup path list. Returns false when an apply must not go ahead. */
function guardPaths(writes) {
  const out = opt('paths-out');
  const check = opt('paths-check');
  console.log(`\n== documents this run can write: ${writes.length}`);
  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
    const body = writes.join('\n') + '\n';
    fs.writeFileSync(out, body, { mode: 0o600 });
    console.log(`  written to ${out} (sha256 ${require('crypto').createHash('sha256').update(body).digest('hex')})`);
  } else {
    for (const p of writes) console.log(`  ${p}`);
  }
  if (!APPLY) return true;
  if (!check) { console.error('refusing to write: an apply needs --paths-check=<the dry run\'s path file>'); return false; }
  const listed = require(path.join(__dirname, '..', '..', 'scripts', 'ops', '_paths.js')).readPathsFile(check);
  const missing = OPS.uncovered(writes, listed);
  if (missing.length) { console.error(`refusing to write: ${missing.length} document(s) are not in ${check} (changed since the dry run?): ${missing.slice(0, 5).join(', ')}. Plan a new op.`); return false; }
  console.log(`  every write is covered by ${check}`);
  return true;
}

async function liveCharters() {
  const snap = await db.collection('leagues').where('chartered', '==', true).get();
  const out = [];
  for (const d of snap.docs) {
    const c = d.data().charter || {};
    const ref = typeof c.ref === 'string' ? c.ref : '';
    const [grant, purchase] = await Promise.all([
      ref ? db.doc(`charter_grants/${OPS.grantDocId(ref)}`).get() : null,
      ref && !ref.startsWith('stripe:') ? db.doc(`purchases/${ref}`).get() : null,
    ]);
    out.push({
      leagueId: d.id, name: d.data().name, ref, source: c.source, season: c.season, expiresAt: c.expiresAt,
      test: purchase?.data()?.charterTest === true, support: grant?.data()?.support === true,
    });
  }
  return out;
}

async function list() {
  const cfg = (await db.doc('config/app').get()).data() || {};
  console.log(`== sale switch: config/app.charter = ${JSON.stringify(cfg.charter ?? null)} (${charterEnabled(cfg) ? 'ON' : 'off'}); minVersion ${cfg.minVersion ?? '(none)'}`);
  const unapplied = await db.collection('purchases').where('productId', '==', 'pitwall.charter.season').where('charterApplied', '==', false).get();
  console.log(`\n== store charters paid but not applied: ${unapplied.size}`);
  for (const d of unapplied.docs) {
    const p = d.data();
    console.log(`  ${d.id}  ${p.platform}  ${p.status}  buyer ${p.userId}  league ${p.leagueId ?? '?'}  refused ${p.charterRefused ?? '?'}${p.environment ? `  ${p.environment}` : ''}`);
  }
  const refused = await db.collection('charter_grants').where('refusedAt', '>', 0).get();
  const open = refused.docs.filter((d) => !d.data().grantedAt && !d.data().clearedAt);
  console.log(`\n== charter_grants refusals still open: ${open.length}`);
  for (const d of open) { const g = d.data(); console.log(`  ${d.id}  ${g.source}  buyer ${g.buyerId}  league ${g.leagueId}  season ${g.season}  refused ${g.refused}  on ${day(g.refusedAt)}`); }
  const live = await liveCharters();
  console.log(`\n== live charters: ${live.length}`);
  for (const c of live) console.log(`  ${c.leagueId}  ${c.name ?? ''}  ${c.source}  season ${c.season} until ${day(c.expiresAt)}  ref ${c.ref}${c.test ? '  TEST' : ''}${c.support ? '  support' : ''}`);
}

async function supportApply() {
  const ref = opt('ref');
  if (!OPS.validRef(ref)) { console.error('--ref=<purchase id | stripe:pi_…> is required'); process.exit(2); }
  const [p, g] = await Promise.all([
    ref.startsWith('stripe:') ? null : db.doc(`purchases/${ref}`).get(),
    db.doc(`charter_grants/${OPS.grantDocId(ref)}`).get(),
  ]);
  const plan = OPS.supportApplyPlan({ ref, leagueArg: opt('league'), purchase: p?.exists ? p.data() : null, grant: g.exists ? g.data() : null, saleSeasonAt: saleSeason });
  if (!plan.ok) { console.error(`cannot apply: ${plan.why}`); process.exit(2); }
  const { input } = plan;
  const league = (await db.doc(`leagues/${input.leagueId}`).get()).data();
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · charter ${input.leagueId} (${league?.name ?? 'no such league'}) for buyer ${input.buyerId}, season ${input.season}, source ${input.source}, ref ${ref}`);
  if (!league) { console.error('no such league'); process.exit(2); }
  if (league.ownerId !== input.buyerId) { console.error(`the buyer does not own that league (owner ${league.ownerId}): refund instead`); process.exit(2); }
  const writes = OPS.charterPaths({ leagueId: input.leagueId, ref, purchaseExists: plan.purchaseExists, uids: await touchedUids(input.leagueId) });
  if (!guardPaths(writes)) process.exit(2);
  if (!APPLY) { console.log('\nNothing was written (add --apply).'); return; }
  const r = await store.grantCharter(db, input);
  if (!r.applied) { console.error(`not applied: ${r.reason}`); process.exit(1); }
  await db.doc(`charter_grants/${OPS.grantDocId(ref)}`).set({ support: true, supportAt: Date.now() }, { merge: true });
  if (plan.purchaseExists) await db.doc(`purchases/${ref}`).set({ charterApplied: true, charterLeagueId: r.leagueId, charterExpiresAt: r.charter.expiresAt, charterSupportApplied: true }, { merge: true });
  console.log(`chartered ${r.leagueId} until ${day(r.charter.expiresAt)}; ${r.members} with access`);
}

async function supportClear() {
  const leagueId = opt('league');
  const ref = opt('ref') || null;
  if (!OPS.validLeague(leagueId)) { console.error('--league=<id> is required'); process.exit(2); }
  if (ref !== null && !OPS.validRef(ref)) { console.error('--ref is not a purchase id or stripe:pi_…'); process.exit(2); }
  const c = (await db.doc(`leagues/${leagueId}`).get()).data()?.charter;
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · clear ${leagueId}: charter ${c ? `${c.source} ${c.season} ref ${c.ref}` : '(none)'}${ref ? `, only if paid by ${ref}` : ''}`);
  const purchaseExists = !!ref && !ref.startsWith('stripe:') && (await db.doc(`purchases/${ref}`).get()).exists;
  const writes = OPS.charterPaths({ leagueId, ref: ref ?? c?.ref ?? null, purchaseExists: false, uids: await touchedUids(leagueId) });
  if (!guardPaths(writes)) process.exit(2);
  if (!APPLY) { console.log('\nNothing was written (add --apply).'); return; }
  const done = await store.clearCharter(db, { leagueId, ref, reason: `support ${opt('reason') || 'clear'}` });
  console.log(done ? 'cleared' : 'nothing of that purchase was live (recorded as refunded if a ref was given)');
  if (purchaseExists) console.log(`purchases/${ref} is unchanged: mark it refunded only once the store has refunded it`);
}

async function sale(state) {
  const cfg = (await db.doc('config/app').get()).data() || {};
  const flagOn = charterEnabled(cfg);
  const live = await liveCharters();
  const launchedAt = typeof cfg.charter?.launchedAt === 'number' ? cfg.charter.launchedAt : null;
  const plan = OPS.salePlan({ state, flagOn, launched: launchedAt !== null, live });
  if (!plan.ok) { console.error(plan.why); process.exit(2); }
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} · sale ${state} · now ${flagOn ? 'ON' : 'off'} · minVersion ${cfg.minVersion ?? '(none)'}`);
  if (state === 'on') console.log('  CHECK: minVersion must be the first build carrying slices 3 and 4, or owners on older builds cannot approve (spec F-175 slice 5).');
  if (plan.already) console.log('  the sale is already on: nothing is cleared');
  if (plan.resumed) console.log(`  the sale was first launched ${day(launchedAt)}: live charters may be paid, so nothing is cleared`);
  for (const c of plan.clear) console.log(`  clear test charter ${c.leagueId} ${c.name ?? ''} (${c.source}, ref ${c.ref}${c.test ? ', charterTest' : ''})`);
  for (const c of plan.keep) console.log(`  keep ${c.leagueId} ${c.name ?? ''} (${c.source}, ref ${c.ref}${c.support ? ', support apply' : ''})`);
  const writes = ['config/app'];
  for (const c of plan.clear) writes.push(...OPS.charterPaths({ leagueId: c.leagueId, ref: c.ref, purchaseExists: false, uids: await touchedUids(c.leagueId) }));
  if (!guardPaths([...new Set(writes)].sort())) process.exit(2);
  if (!APPLY) { console.log('\nNothing was written (add --apply).'); return; }
  for (const c of plan.clear) {
    const done = await store.clearCharter(db, { leagueId: c.leagueId, ref: c.ref || null, reason: 'test charter cleared at the sale flip' });
    console.log(`  ${c.leagueId}: ${done ? 'cleared' : 'nothing to clear'}`);
  }
  // launchedAt marks the first launch; sale-off keeps it, so a later resume never clears paid charters.
  await db.doc('config/app').set({ charter: { enabled: state === 'on', ...(state === 'on' && launchedAt === null ? { launchedAt: Date.now() } : {}) } }, { merge: true });
  console.log(`config/app.charter.enabled = ${state === 'on'}`);
}

async function main() {
  const action = opt('action');
  if (action === 'list') await list();
  else if (action === 'apply') await supportApply();
  else if (action === 'clear') await supportClear();
  else if (action === 'sale-on') await sale('on');
  else if (action === 'sale-off') await sale('off');
  else { console.error('--action= list | apply | clear | sale-on | sale-off'); process.exit(2); }
  process.exit(0);
}

if (require.main === module) {
  initAdmin();
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
