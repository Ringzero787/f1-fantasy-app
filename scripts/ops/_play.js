/**
 * The decisions behind publishing to Google Play, separated from the network so they can be tested.
 *
 * A mistake here ships a wrong build to every Android user, so the argument handling is deliberately
 * unforgiving: the track is checked against a fixed list before it is ever interpolated into a
 * request path, an argument the script does not recognise stops the run instead of being dropped,
 * and nothing defaults to production.
 */
const TRACKS = ['internal', 'alpha', 'beta', 'production'];
const FLAGS = ['track', 'notes', 'apply', 'confirm'];

/**
 * Flags that are not understood are refused rather than ignored.
 *
 * `--track internal` with a space used to parse as nothing, and a command that then fell back to a
 * production default would promote to production while the operator believed they had said
 * internal. Returns the offending argument, or null.
 */
function unknownFlag(argv = []) {
  for (const a of argv) {
    if (!a.startsWith('--')) continue;          // positional: the command, a path, a version code
    const name = a.slice(2).split('=')[0];
    if (!FLAGS.includes(name)) return a;
    if (name !== 'apply' && !a.includes('=')) return a;   // a bare --track carries no value
  }
  return null;
}

const valueOf = (argv, name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

/**
 * The track to act on. There is no default: every caller says where it is going, because the one
 * value worth guessing wrong is the one that reaches every user.
 */
function resolveTrack(argv = []) {
  const track = valueOf(argv, 'track');
  if (track === null) return { error: 'no --track= given. One of: ' + TRACKS.join(', ') };
  if (!TRACKS.includes(track)) return { error: `"${track}" is not a track. One of: ${TRACKS.join(', ')}` };
  return { track };
}

/**
 * Pushing to production takes a second, deliberate argument naming the package.
 *
 * Everything else about this script is recoverable — an edit expires, a test track reaches nobody.
 * A completed production release is installed on real devices within minutes, so it asks twice.
 */
function productionGuard(track, argv = [], pkg) {
  if (track !== 'production') return null;
  return valueOf(argv, 'confirm') === pkg ? null
    : `publishing to production needs --confirm=${pkg} as well, so it cannot happen by typo`;
}

/** A version code is digits, and Play counts up: anything else is a mistyped argument. */
const validVersionCode = (v) => typeof v === 'string' && /^[1-9]\d{0,8}$/.test(v);

/**
 * The release Play expects. `versionCodes` are strings in this API even though a bundle reports its
 * version code as a number, and `status: completed` means a full rollout rather than a staged one.
 */
function releaseFor(versionCode, notes) {
  const release = { name: String(versionCode), versionCodes: [String(versionCode)], status: 'completed' };
  if (notes) release.releaseNotes = [{ language: 'en-US', text: notes }];
  return release;
}

module.exports = { TRACKS, FLAGS, unknownFlag, valueOf, resolveTrack, productionGuard, validVersionCode, releaseFor };
