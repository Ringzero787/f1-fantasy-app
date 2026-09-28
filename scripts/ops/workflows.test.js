/**
 * The CI workflows are rendered by `aidlc sync` from the engine repo, and the engine's copy still
 * passes ANTHROPIC_API_KEY to the gate runner. ADR-003 took that out on purpose: the model gates
 * run on the maintainer's subscription now. A routine engine bump would re-render the files and put
 * the key back with nobody noticing, so this test — which runs in CI itself — is the guard.
 *
 * If this fails after a sync: re-apply the decision, or replace ADR-003 with one that says why the
 * key is back.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', '..', '.github', 'workflows');
const aidlcWorkflows = fs.readdirSync(DIR).filter((f) => f.startsWith('aidlc-') && f.endsWith('.yml'));

test('the aidlc workflows do not pass a model API key (ADR-003)', () => {
  assert.ok(aidlcWorkflows.length >= 3, 'expected the aidlc pr, release and lookback workflows');
  for (const f of aidlcWorkflows) {
    const body = fs.readFileSync(path.join(DIR, f), 'utf8');
    assert.equal(body.includes('ANTHROPIC_API_KEY'), false, `${f} references ANTHROPIC_API_KEY — see ADR-003; a sync has probably re-rendered it`);
  }
});

test('the security scanners are proven present, so an empty G05 cannot pass for want of a binary', () => {
  const pr = fs.readFileSync(path.join(DIR, 'aidlc-pr.yml'), 'utf8');
  assert.match(pr, /command -v semgrep/, 'aidlc-pr.yml must assert semgrep installed: the scanners are installed best-effort, and with the model half of G05 gone they are the whole gate');
  assert.match(pr, /command -v gitleaks/, 'aidlc-pr.yml must assert gitleaks installed');
});
