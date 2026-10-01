/**
 * The Pit Wall config decisions — which mode each platform runs in, and which controls survive a
 * run that passes no flags. Kept pure and free of any credential so they can be tested, because
 * this is a production switch with no build behind it: what is written here reaches every installed
 * client on the next read, and there is no review step between here and a player.
 *
 *   open  the row opens the portal. No price and no purchase wording anywhere in the app.
 *   iap   the row sells the pass through that store. Only once the product is live there.
 *   off   the surface is hidden on that platform.
 */
const MODES = ['open', 'iap', 'off'];

/**
 * The production state, and the record of why.
 *
 * iOS sells through the App Store from 2.4.0: the product `pitwall.pass.season` ships with that
 * build, and leaving iOS on `open` while a product is in review gives the reviewer a web page
 * instead of a purchase, which fails as both an unlocatable purchase and a guideline 3.1.1 link-out.
 *
 * Android sells from 2.4.0 versionCode 63. Its product is Active at USD 14.99 in 174 countries with
 * a backwards-compatible purchase option, which is what keeps the plain product-id call the app
 * makes working against Play's one-time product model, and the Cloud Functions runtime account holds
 * the Play permissions that let the server verify an order.
 *
 * The caveat on Android is versionCode 62, which is also version 2.4.0 and has no purchase lifecycle
 * wired up. The version gate compares versions, not version codes, so there is no way to show this to
 * 63 and hide it from 62. Someone still on 62 gets Play's refusal at the billing call rather than a
 * charge, because the connection `initializeIAP` opens was never opened there.
 *
 * Amazon stays `open` until its product is active and a build carrying it has shipped. A platform set
 * to `iap` before its product exists gives the buyer an error at the payment sheet instead of a pass.
 */
const DESIRED = { android: 'iap', ios: 'iap', amazon: 'open' };

const PLATFORMS = Object.keys(DESIRED);

/** Every flag this script understands. Anything else is a typo, and typos here cost money. */
const FLAGS = ['apply', 'mode', 'enabled', 'beta', 'betaLeagues', 'minAppVersion', ...PLATFORMS];

const reader = (argv = []) => ({
  given: (name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`)),
  value: (name) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; },
});

const list = (v) => (typeof v === 'string' && v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);

/**
 * Flags that are not understood are refused rather than ignored.
 *
 * `--mode off` with a space, or a misspelt platform, used to parse as nothing and fall through to
 * the defaults. That was survivable while every default was `open`; now the fall-through is "iOS
 * sells the pass", so a fumbled kill switch would open a paid surface instead of closing one.
 * Returns the offending argument, or null.
 */
function unknownFlag(argv = []) {
  for (const a of argv) {
    if (!a.startsWith('--')) return a;
    const name = a.slice(2).split('=')[0];
    if (!FLAGS.includes(name)) return a;
    // a bare `--mode` carries no value and would silently do nothing
    if (name !== 'apply' && !a.includes('=')) return a;
  }
  return null;
}

/**
 * `--mode=X` sets every platform; `--ios=X` and friends beat it; with neither, DESIRED applies —
 * except that a platform the live document has turned `off` stays off.
 *
 * `off` is a containment control, like `enabled` and the allowlists: someone sets it when a
 * platform is doing harm. Asserting DESIRED over it would mean the next routine run — changing an
 * unrelated platform, say — silently re-opened a paid surface that had been shut down on purpose.
 * Turning a platform back on is therefore deliberate: `--ios=open` or `--ios=iap`.
 */
function resolveMode(argv = [], desired = DESIRED, current = null) {
  const { value } = reader(argv);
  const live = (current && typeof current === 'object' && current.mode) || {};
  const all = value('mode');
  const mode = {};
  for (const platform of PLATFORMS) {
    // `??` and not `||`: an empty `--mode=` must reach the validator rather than quietly becoming
    // the production default, which is the one state an operator reaching for this flag does not want.
    const asked = value(platform) ?? all;
    if (asked !== null && asked !== undefined) { mode[platform] = asked; continue; }
    mode[platform] = live[platform] === 'off' ? 'off' : desired[platform];
  }
  return mode;
}

/** Returns the offending platform, or null when every value is a mode we know. */
function invalidPlatform(mode) {
  for (const [platform, value] of Object.entries(mode ?? {})) if (!MODES.includes(value)) return platform;
  return null;
}

/**
 * `enabled` and the two beta allowlists are containment controls: one hides Pit Wall everywhere,
 * the others limit it to named accounts or leagues. Someone reaches for them when something is
 * wrong, and the usual run of this script passes no flags at all, so each is carried over from the
 * live document unless its own flag says otherwise. Rebuilding them from defaults would quietly
 * re-open the surface and clear the allowlist every time anyone changed a mode.
 *
 * The two lists are held independently: passing `--beta=` to clear accounts must not also drop the
 * beta leagues.
 */
function carryContainment(current, argv = []) {
  const live = current && typeof current === 'object' ? current : {};
  const { given, value } = reader(argv);
  const beta = live.beta && typeof live.beta === 'object' ? live.beta : {};
  const held = (key, flag) => (given(flag) ? list(value(flag)) : [...(Array.isArray(beta[key]) ? beta[key] : [])]);
  return {
    // absent means on, so a document written before the field existed is not read as disabled
    enabled: given('enabled') ? value('enabled') === 'true' : live.enabled !== false,
    beta: { uids: held('uids', 'beta'), leagueIds: held('leagueIds', 'betaLeagues') },
  };
}

/** `--enabled=` takes a boolean and nothing else, so `--enabled=yes` is an error, not a silent off. */
function invalidEnabled(argv = []) {
  const { given, value } = reader(argv);
  if (!given('enabled')) return null;
  const v = value('enabled');
  return v === 'true' || v === 'false' ? null : v;
}

/** Platforms whose live mode differs from what is about to be written, so a revert is visible. */
function modeChanges(current, next) {
  const live = (current && typeof current === 'object' && current.mode) || {};
  return PLATFORMS.filter((p) => live[p] !== undefined && live[p] !== next[p]).map((p) => ({ platform: p, from: live[p], to: next[p] }));
}

module.exports = { MODES, DESIRED, PLATFORMS, FLAGS, resolveMode, invalidPlatform, carryContainment, invalidEnabled, unknownFlag, modeChanges };
