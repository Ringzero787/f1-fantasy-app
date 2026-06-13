// One-time backfill: rebuild every team's server budget/totalSpent as a cash
// ledger now that Phase 3 no longer overwrites budget and roster ops go
// through the secure callables.
//
// Server budgets were garbage before this migration: Phase 3 recomputed
// budget = 1000 - totalSpent + unrealized value change every race, with
// totalSpent permanently 0 (nothing maintained it), so every team showed
// ~$1000 + price drift regardless of what they actually spent.
//
// Reconstruction (best effort — past sale fees/proceeds are unrecoverable):
//   totalSpent = Σ purchasePrice(current roster drivers) + ctor purchasePrice
//   budget     = max(0, 1000 - totalSpent)
//
// This assumes past sales netted zero, which is wrong in detail but bounded,
// applies the same rule to everyone, and is self-consistent with the new
// cash-ledger semantics going forward.
//
// Usage: node tmp_backfill_budgets.js [--apply]
//   (dry run by default — prints per-team changes without writing)

const fs = require('fs');
const path = require('path');
const os = require('os');
const PROJECT_ID = 'f1-app-18077';
const fbConfig = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));

const APPLY = process.argv.includes('--apply');
const STARTING_BUDGET = 1000;

async function getToken() {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: fbConfig.tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  return (await resp.json()).access_token;
}

function parseFields(fields) {
  const r = {};
  for (const [k, v] of Object.entries(fields)) r[k] = parseValue(v);
  return r;
}
function parseValue(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
  if ('mapValue' in v) return parseFields(v.mapValue.fields || {});
  return v;
}

async function runQuery(token, collectionId) {
  const parent = `projects/${PROJECT_ID}/databases/(default)/documents`;
  const resp = await fetch(`https://firestore.googleapis.com/v1/${parent}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }] } }),
  });
  return (await resp.json()).filter(d => d.document).map(d => ({
    id: d.document.name.split('/').pop(),
    _path: d.document.name,
    ...parseFields(d.document.fields || {}),
  }));
}

async function patchDoc(token, docPath, fields) {
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const url = `https://firestore.googleapis.com/v1/${docPath}?${mask}`;
  const firestoreFields = {};
  for (const [k, v] of Object.entries(fields)) {
    firestoreFields[k] = { integerValue: String(v) };
  }
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields }),
  });
  if (!resp.ok) throw new Error(`PATCH ${docPath} failed: ${resp.status} ${await resp.text()}`);
}

(async () => {
  const token = await getToken();
  const teams = await runQuery(token, 'fantasyTeams');
  console.log(`${teams.length} teams loaded. Mode: ${APPLY ? 'APPLY' : 'dry run'}\n`);

  let changed = 0;
  for (const team of teams) {
    const drivers = Array.isArray(team.drivers) ? team.drivers : [];
    const ctor = team.constructor && typeof team.constructor === 'object' ? team.constructor : null;

    const totalSpent = drivers.reduce((s, d) => s + (d.purchasePrice || 0), 0)
      + (ctor ? (ctor.purchasePrice || 0) : 0);
    const budget = Math.max(0, STARTING_BUDGET - totalSpent);

    const oldBudget = typeof team.budget === 'number' ? team.budget : '?';
    const oldSpent = typeof team.totalSpent === 'number' ? team.totalSpent : '?';

    if (oldBudget === budget && oldSpent === totalSpent) continue;
    changed++;
    console.log(`${team.name || team.id}: budget ${oldBudget} -> ${budget}, totalSpent ${oldSpent} -> ${totalSpent} (${drivers.length} drivers${ctor ? ' + ctor' : ''})`);

    if (APPLY) {
      await patchDoc(token, team._path, { budget, totalSpent });
    }
  }

  console.log(`\n${changed}/${teams.length} teams ${APPLY ? 'updated' : 'would change'}.`);
  if (!APPLY) console.log('Re-run with --apply to write.');
})();
