// F-175 slice 5: the pure half of scripts/charterSupport.js (support fixes and the sale flip).
// No Firestore here, so every decision is unit-tested (scripts/charterOps.test.js).

/** A purchase id (store: 40 hex, older records random), or `stripe:pi_…`. Never a path. */
const REF = /^(stripe:pi_[A-Za-z0-9]{6,80}|[A-Za-z0-9_-]{6,80})$/;
const LEAGUE = /^[A-Za-z0-9_-]{1,128}$/;
const validRef = (r) => typeof r === 'string' && REF.test(r);
const validLeague = (l) => typeof l === 'string' && LEAGUE.test(l);

/** charter_grants doc id for a ref, as charterStore.grantRef writes it. */
const grantDocId = (ref) => ref.replace(/\//g, '_');

/**
 * Every document a grant or clear of `leagueId` by `ref` can write: the league, the grant record,
 * the purchase (store refs only), and each user who may gain or lose access (members and holders).
 */
function charterPaths({ leagueId, ref, purchaseExists, uids }) {
  const out = new Set([`leagues/${leagueId}`]);
  if (ref) out.add(`charter_grants/${grantDocId(ref)}`);
  if (ref && purchaseExists) out.add(`purchases/${ref}`);
  for (const u of uids || []) out.add(`users/${u}`);
  return [...out].sort();
}

/** Paths in `writes` that the backup list does not cover. */
const uncovered = (writes, listed) => {
  const have = new Set(listed);
  return writes.filter((p) => !have.has(p));
};

/**
 * What a support `apply` should do with a paid charter that did not apply. `purchase` and `grant`
 * are the purchases/{ref} and charter_grants/{ref} documents (either may be missing; Stripe has no
 * purchase document). Returns the grant input, or why not.
 */
function supportApplyPlan({ ref, leagueArg, purchase, grant, saleSeasonAt }) {
  if (!validRef(ref)) return { ok: false, why: `"${ref}" is not a purchase id or stripe:pi_… reference` };
  if (purchase && purchase.productId !== 'pitwall.charter.season') return { ok: false, why: `purchase is for ${purchase.productId}, not a charter` };
  if (!purchase && !grant) return { ok: false, why: 'no purchase and no charter_grants record for that reference' };
  if (purchase?.status === 'refunded' || grant?.clearedAt) return { ok: false, why: 'that purchase was refunded: it never charters again' };
  if (grant?.grantedAt && !grant.clearedAt) return { ok: false, why: `already applied to ${grant.leagueId}` };
  if (purchase?.charterApplied === true) return { ok: false, why: `already applied to ${purchase.charterLeagueId}` };
  const buyerId = (purchase && purchase.userId) || (grant && grant.buyerId) || '';
  if (!buyerId) return { ok: false, why: 'no buyer on the purchase or the grant record' };
  const leagueId = leagueArg && leagueArg !== '-' ? leagueArg : (grant && grant.leagueId) || (purchase && purchase.leagueId) || '';
  if (!validLeague(leagueId)) return { ok: false, why: 'no league: pass league=<id>' };
  const createdMs = purchase && purchase.createdAt && typeof purchase.createdAt.toMillis === 'function' ? purchase.createdAt.toMillis() : null;
  const season = (grant && grant.season) || saleSeasonAt(createdMs ?? Date.now());
  const source = (grant && grant.source) || (purchase && purchase.platform === 'ios' ? 'apple' : 'play');
  if (ref.startsWith('stripe:') && source !== 'stripe') return { ok: false, why: 'a stripe: reference must have a stripe grant record' };
  return { ok: true, input: { leagueId, buyerId, season, source, ref }, purchaseExists: !!purchase };
}

/**
 * The sale flip. Before the flag is on, nothing real can charter except a support apply (which
 * marks its grant record `support: true`), so every other live charter is a test charter and is
 * cleared first (spec F-175 slice 5). With the flag already on, nothing is cleared.
 *
 * `live` is [{ leagueId, ref, test, support }] for every league with a live charter.
 */
function salePlan({ state, flagOn, live }) {
  if (state !== 'on' && state !== 'off') return { ok: false, why: 'state must be on or off' };
  if (state === 'off') return { ok: true, clear: [], keep: live, set: false };
  if (flagOn) return { ok: true, clear: [], keep: live, set: true, already: true };
  const clear = live.filter((c) => !c.support);
  const keep = live.filter((c) => c.support);
  return { ok: true, clear, keep, set: true };
}

module.exports = { validRef, validLeague, grantDocId, charterPaths, uncovered, supportApplyPlan, salePlan };
