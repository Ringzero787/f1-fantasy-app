/**
 * Which mode the Pit Wall surface runs in, per platform — the decision itself, kept pure so it can
 * be tested without a Firebase credential.
 *
 *   open  the row opens the portal. No price and no purchase wording anywhere in the app.
 *   iap   the row sells the pass through that store. Only once the product is live there.
 *   off   the surface is hidden on that platform.
 *
 * DESIRED is the production state and the record of why: a platform sells in-app only once its
 * store product exists, because the Profile row is the app's only purchase surface. Setting a
 * platform to `iap` before its product is active gives a buyer an error at the payment sheet; on
 * iOS, leaving it `open` while a product is in review gives the reviewer a web page instead of a
 * purchase, which fails review as both an unlocatable purchase and a guideline 3.1.1 link-out.
 */
const MODES = ['open', 'iap', 'off'];

/** iOS sells through the App Store from 2.4.0. Android and Amazon follow when their products are live. */
const DESIRED = { android: 'open', ios: 'iap', amazon: 'open' };

const PLATFORMS = Object.keys(DESIRED);

/**
 * `--mode=X` sets every platform; `--ios=X` and friends beat it; with neither, DESIRED applies.
 *
 * The fallback is `??` and not `||` on purpose: `--mode=` with nothing after it must reach the
 * validator and be rejected, rather than silently becoming the desired mode.
 */
function resolveMode(argv = [], desired = DESIRED) {
  const arg = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const all = arg('mode');
  const mode = {};
  for (const platform of PLATFORMS) mode[platform] = arg(platform) ?? all ?? desired[platform];
  return mode;
}

/** Returns the offending platform, or null when every value is a mode we know. */
function invalidPlatform(mode) {
  for (const [platform, value] of Object.entries(mode)) if (!MODES.includes(value)) return platform;
  return null;
}

/**
 * `enabled` and `beta` are the containment controls: one hides Pit Wall everywhere, the other limits
 * it to named accounts. Someone reaches for them when something is wrong, and the usual run of the
 * script passes no flags at all, so they are carried over from the live document unless a flag says
 * otherwise. Rebuilding them from defaults would quietly re-open the surface and clear the allowlist
 * every time anyone changed a mode.
 */
function carryContainment(current = {}, argv = []) {
  const given = (n) => argv.some((a) => a.startsWith(`--${n}=`));
  const arg = (n) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : null; };
  const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []);
  const beta = current.beta ?? {};
  return {
    // absent means on, so a document that predates the field is not read as disabled
    enabled: given('enabled') ? arg('enabled') === 'true' : current.enabled !== false,
    beta: given('beta') || given('betaLeagues')
      ? { uids: list(arg('beta')), leagueIds: list(arg('betaLeagues')) }
      : { uids: [...(Array.isArray(beta.uids) ? beta.uids : [])], leagueIds: [...(Array.isArray(beta.leagueIds) ? beta.leagueIds : [])] },
  };
}

module.exports = { MODES, DESIRED, PLATFORMS, resolveMode, invalidPlatform, carryContainment };
