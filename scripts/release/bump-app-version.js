// Stamp a release version into an Expo app.config.js and move android.versionCode
// (and ios.buildNumber, when the file has one) on by one — the first step of a
// local release build (build-tl-aab.sh, build-uc-*.sh).
// Play refuses any versionCode it has already seen (even from an upload that was
// never released), so the code only goes up. Re-running for the same version
// keeps the code, so a failed build can be retried without burning a number.
//
// Usage: node scripts/release/bump-app-version.js <app.config.js> <x.y.z> [--ios]
// Prints the resulting versionCode on stdout (the iOS buildNumber with --ios).
// Several release targets call this for the same version in one run; only the
// first call moves the numbers.
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
  const b = source.match(/(\bbuildNumber:\s*)(["'])(\d+)\2/);
  const current = v[3];
  const code = Number(c[2]);
  const build = b ? Number(b[3]) : null;
  if (current === version) return { source, versionCode: code, buildNumber: build, changed: false };
  if (cmpSemver(version, current) < 0) throw new Error(`version ${version} is older than ${current}`);
  let next = source.replace(v[0], `${v[1]}${v[2]}${version}${v[2]}`).replace(c[0], `${c[1]}${code + 1}`);
  if (b) next = next.replace(b[0], `${b[1]}${b[2]}${build + 1}${b[2]}`);
  return { source: next, versionCode: code + 1, buildNumber: b ? build + 1 : null, changed: true };
}

module.exports = { bump };

if (require.main === module) {
  const args = process.argv.slice(2);
  const ios = args.includes('--ios');
  const [file, version] = args.filter((a) => a !== '--ios');
  if (!file || !version) {
    console.error('usage: bump-app-version.js <app.config.js> <x.y.z> [--ios]');
    process.exit(2);
  }
  try {
    const r = bump(fs.readFileSync(file, 'utf8'), version);
    // Validate before touching the file: a refused --ios call must not leave
    // a bumped versionCode behind.
    if (ios && r.buildNumber === null) throw new Error('app.config.js has no ios buildNumber');
    if (r.changed) fs.writeFileSync(file, r.source);
    console.error(`${file}: version ${version}, versionCode ${r.versionCode}${r.buildNumber !== null ? `, buildNumber ${r.buildNumber}` : ''}${r.changed ? '' : ' (already set)'}`);
    console.log(ios ? r.buildNumber : r.versionCode);
  } catch (e) {
    console.error(`bump-app-version: ${e.message}`);
    process.exit(1);
  }
}
