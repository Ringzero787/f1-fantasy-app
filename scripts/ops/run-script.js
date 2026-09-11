// Runs an operator script by plain file name from one codebase's scripts folder —
// the uc-script / tl-script aidlc op kinds. A --param cannot point anywhere else:
// no directories, no ../, no shell metacharacters. Remaining flags pass through.
//
// Usage: node scripts/ops/run-script.js <undercut|tracklimits> <script.js> [--apply | --write …]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validScriptName } = require('./_paths');

const ROOT = path.resolve(__dirname, '..', '..');
const CODEBASES = { undercut: 'functions', tracklimits: 'newgame/functions' };

function fail(message) {
  console.error(`run-script: ${message}`);
  process.exit(2);
}

const [app, script, ...flags] = process.argv.slice(2);
const base = CODEBASES[app];
if (!base) fail(`first argument must be ${Object.keys(CODEBASES).join(' or ')}`);
if (!validScriptName(script)) fail(`"${script}" is not a plain script file name`);
const file = path.join(ROOT, base, 'scripts', script);
if (!fs.existsSync(file)) fail(`${path.relative(ROOT, file)} does not exist`);

const r = spawnSync(process.execPath, [file, ...flags], { cwd: path.join(ROOT, base), stdio: 'inherit' });
process.exit(r.status ?? 1);
