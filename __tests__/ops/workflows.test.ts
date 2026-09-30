/**
 * The CI workflows are rendered by `aidlc sync` from the engine repo, and the engine's copy still
 * passes ANTHROPIC_API_KEY to the gate runner. ADR-003 took that out on purpose: the model gates
 * run on the maintainer's subscription now. A routine engine bump would re-render the files and put
 * the key back with nobody noticing, so this test is the guard.
 *
 * If this fails after a sync: re-apply the decision, or replace ADR-003 with one that says why the
 * key is back.
 *
 * Moved here from scripts/ops/workflows.test.js. It did run in CI — the hygiene test command in
 * .aidlc/aidlc.yaml globs scripts/ops/*.test.js through node:test — but not under `npm test`, which
 * is jest and roots at __tests__. Living here means both paths cover it. The other node:test files
 * still under scripts/ops and scripts/release are live and must not be deleted.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.join(__dirname, '..', '..', '.github', 'workflows');
const aidlcWorkflows = fs.readdirSync(DIR).filter((f) => f.startsWith('aidlc-') && f.endsWith('.yml'));

describe('aidlc workflows', () => {
  it('do not pass a model API key (ADR-003)', () => {
    expect(aidlcWorkflows.length).toBeGreaterThanOrEqual(3);
    const offenders = aidlcWorkflows.filter((f) => fs.readFileSync(path.join(DIR, f), 'utf8').includes('ANTHROPIC_API_KEY'));
    expect(offenders).toEqual([]);
  });

  it('prove the security scanners are present, so an empty G05 cannot pass for want of a binary', () => {
    const pr = fs.readFileSync(path.join(DIR, 'aidlc-pr.yml'), 'utf8');
    // installed best-effort, and with the model half of G05 gone they are the whole gate
    expect(pr).toMatch(/command -v semgrep/);
    expect(pr).toMatch(/command -v gitleaks/);
  });
});
