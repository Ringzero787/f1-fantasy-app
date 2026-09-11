// Stamp a release version into an Expo app.config.js and move android.versionCode
// on by one — the first step of a local release build (build-tl-aab.sh).
// Play refuses any versionCode it has already seen (even from an upload that was
// never released), so the code only goes up. Re-running for the same version
// keeps the code, so a failed build can be retried without burning a number.
//
// Usage: node scripts/release/bump-app-version.js <app.config.js> <x.y.z>
// Prints the resulting versionCode on stdout.
const fs = require('fs');

const cmpSemver = (a, b) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};

function bump(source, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`version "${version}" is not x.y.z`);
  const v = source.match(/(\bversion:\s*)(["'])([^"']+)\2/);
  const c = source.match(/(\bversionCode:\s*)(\d+)/);
  if (!v || !c) throw new Error('app.config.js needs a `version: "x.y.z"` and an android `versionCode: n`');
  const current = v[3];
  const code = Number(c[2]);
  if (current === version) return { source, versionCode: code, changed: false };
  if (cmpSemver(version, current) < 0) throw new Error(`version ${version} is older than ${current}`);
  const next = source.replace(v[0], `${v[1]}${v[2]}${version}${v[2]}`).replace(c[0], `${c[1]}${code + 1}`);
  return { source: next, versionCode: code + 1, changed: true };
}

module.exports = { bump };

if (require.main === module) {
  const [file, version] = process.argv.slice(2);
  if (!file || !version) {
    console.error('usage: bump-app-version.js <app.config.js> <x.y.z>');
    process.exit(2);
  }
  try {
    const r = bump(fs.readFileSync(file, 'utf8'), version);
    if (r.changed) fs.writeFileSync(file, r.source);
    console.error(`${file}: version ${version}, versionCode ${r.versionCode}${r.changed ? '' : ' (already set)'}`);
    console.log(r.versionCode);
  } catch (e) {
    console.error(`bump-app-version: ${e.message}`);
    process.exit(1);
  }
}
