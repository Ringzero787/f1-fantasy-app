// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const p = require('../lib/pitwall/pass.js');
const s = require('../lib/pitwall/stripe.js');

test('a season pass runs to the end of January after that season, and an active pass is one that has not expired', () => {
  const expiry = p.seasonExpiry('2026');
  assert.equal(new Date(expiry).toISOString(), '2027-01-31T23:59:59.999Z');
  assert.throws(() => p.seasonExpiry('soon'), /bad season/);
  const pass = p.newPass('2026', 'stripe', 1000, 'evt_1');
  assert.deepEqual(pass, { tier: 'pitwall', season: '2026', expiresAt: expiry, source: 'stripe', grantedAt: 1000, ref: 'evt_1' });
  assert.equal(p.passActive(pass, expiry - 1), true);
  assert.equal(p.passActive(pass, expiry), false);
  assert.equal(p.passActive({ tier: 'other', expiresAt: expiry }, 0), false);
  assert.equal(p.passActive(undefined, 0), false);
});

test('the claim is the expiry in whole seconds, and absent for an expired or missing pass', () => {
  const pass = p.newPass('2026', 'grant', 1000);
  assert.equal(p.passClaim(pass), Math.floor(p.seasonExpiry('2026') / 1000));
  assert.equal(p.passClaim(null), null);
  assert.equal(p.passClaim({ tier: 'pitwall', expiresAt: -1 }), null);
});

test('a trial is seven days, never outlives the season, and a new grant never shortens what a user already has', () => {
  const now = Date.UTC(2026, 8, 24);
  const trial = p.trialPass('2026', now);
  assert.equal(trial.expiresAt, now + 7 * 86400000);
  assert.equal(trial.ref, 'league_trial');
  // a trial started in late January cannot run past the season's end
  assert.equal(p.trialPass('2026', Date.UTC(2027, 0, 30)).expiresAt, p.seasonExpiry('2026'));
  // buying while a longer pass is held keeps the longer expiry
  const long = { tier: 'pitwall', season: '2026', expiresAt: p.seasonExpiry('2027'), source: 'grant', grantedAt: 0 };
  assert.equal(p.mergePass(long, p.newPass('2026', 'stripe', now)).expiresAt, p.seasonExpiry('2027'));
  assert.equal(p.mergePass(trial, p.newPass('2026', 'stripe', now)).expiresAt, p.seasonExpiry('2026'));
  assert.equal(p.mergePass(undefined, p.newPass('2026', 'stripe', now)).source, 'stripe');
});

test('the season of a date: January still belongs to the season that just ended', () => {
  assert.equal(p.currentSeason(Date.UTC(2026, 8, 24)), '2026');
  assert.equal(p.currentSeason(Date.UTC(2027, 0, 5)), '2026');
  assert.equal(p.currentSeason(Date.UTC(2027, 1, 5)), '2027');
});

// ── Stripe ──
const sign = (body, secret, t) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')}`;

test('F-146: from December a pass is sold for next season, so a December or January buyer gets the whole of it', () => {
  assert.equal(p.saleSeason(Date.UTC(2026, 10, 30, 23, 59)), '2026');
  assert.equal(p.saleSeason(Date.UTC(2026, 11, 1)), '2027');
  assert.equal(p.saleSeason(Date.UTC(2026, 11, 6, 13)), '2027'); // Abu Dhabi weekend: the pass still covers it
  assert.equal(p.saleSeason(Date.UTC(2027, 0, 15)), '2027');
  assert.equal(p.saleSeason(Date.UTC(2027, 5, 1)), '2027');
  // the bug: a pass bought on 10 December was stamped 2026 and ran out seven weeks later
  const bought = Date.UTC(2026, 11, 10);
  assert.equal(new Date(p.newPass(p.saleSeason(bought), 'play', bought).expiresAt).toISOString(), '2028-01-31T23:59:59.999Z');
});

test('F-146: only a pass that already reaches the end of the season being sold blocks a new checkout', () => {
  const dec = Date.UTC(2026, 11, 10);
  const pass2026 = p.newPass('2026', 'stripe', Date.UTC(2026, 5, 1));
  const pass2027 = p.newPass('2027', 'stripe', dec);
  assert.equal(p.passCoversSeason(pass2026, '2026', dec), true);
  assert.equal(p.passCoversSeason(pass2026, '2027', dec), false); // a 2026 holder may renew for 2027
  assert.equal(p.passCoversSeason(pass2027, '2027', dec), true);
  assert.equal(p.passCoversSeason(p.trialPass('2027', dec), '2027', dec), false); // a trial never blocks buying
  assert.equal(p.passCoversSeason(undefined, '2027', dec), false);
  assert.equal(p.passCoversSeason(pass2027, '2027', p.seasonExpiry('2027')), false); // expired
  // renewing keeps the longer expiry and the new season
  const renewed = p.mergePass(pass2026, p.newPass('2027', 'stripe', dec, 'evt_2'));
  assert.equal(renewed.season, '2027');
  assert.equal(renewed.expiresAt, p.seasonExpiry('2027'));
});

test('a webhook signature is accepted only when it matches, is fresh, and carries valid JSON', () => {
  const secret = 'whsec_test', body = JSON.stringify({ id: 'evt_1', type: 'ping' }), t = 1_800_000_000;
  assert.deepEqual(s.verifyStripeSignature(body, sign(body, secret, t), secret, t), { ok: true, event: { id: 'evt_1', type: 'ping' } });
  assert.equal(s.verifyStripeSignature(body, sign(body, secret, t), secret, t + 299).ok, true);
  assert.equal(s.verifyStripeSignature(body, sign(body, secret, t), secret, t + 301).reason, 'stale');
  assert.equal(s.verifyStripeSignature(body, sign(body, 'whsec_other', t), secret, t).reason, 'bad-signature');
  assert.equal(s.verifyStripeSignature(body + ' ', sign(body, secret, t), secret, t).reason, 'bad-signature');
  assert.equal(s.verifyStripeSignature(body, undefined, secret, t).reason, 'no-signature');
  assert.equal(s.verifyStripeSignature(body, 't=abc,v1=zz', secret, t).reason, 'malformed');
  assert.equal(s.verifyStripeSignature('not json', sign('not json', secret, t), secret, t).reason, 'bad-json');
  // Stripe sends several v1 signatures while a secret is being rotated: any one matching is enough
  const rolled = `${sign(body, 'whsec_old', t)},v1=${createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')}`;
  assert.equal(s.verifyStripeSignature(body, rolled, secret, t).ok, true);
});

test('only a paid checkout grants; refunds and disputes revoke; anything else is ignored', () => {
  const paid = { id: 'evt_9', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', metadata: { uid: 'u1', season: '2026' } } } };
  assert.deepEqual(s.webhookAction(paid), { kind: 'grant', uid: 'u1', season: '2026', ref: 'evt_9' });
  assert.equal(s.webhookAction({ ...paid, data: { object: { ...paid.data.object, payment_status: 'unpaid' } } }).kind, 'ignore');
  assert.equal(s.webhookAction({ ...paid, data: { object: { payment_status: 'paid', metadata: {} } } }).kind, 'ignore');
  // the uid may arrive as client_reference_id instead of metadata
  assert.equal(s.webhookAction({ id: 'e', type: 'checkout.session.completed', data: { object: { payment_status: 'paid', client_reference_id: 'u2', metadata: { season: '2026' } } } }).uid, 'u2');
  assert.deepEqual(s.webhookAction({ id: 'e2', type: 'charge.refunded', data: { object: { metadata: { uid: 'u1' } } } }), { kind: 'revoke', uid: 'u1', reason: 'charge.refunded' });
  assert.equal(s.webhookAction({ id: 'e3', type: 'customer.created', data: { object: {} } }).kind, 'ignore');
  assert.equal(s.webhookAction({}).kind, 'ignore');
});

test('the checkout session charges $14.99 once and carries the uid back to the webhook', () => {
  const params = s.checkoutSessionParams({ uid: 'u1', season: '2026', email: 'a@b.c' }, 'https://x/ok', 'https://x/no');
  assert.equal(params['line_items[0][price_data][unit_amount]'], '1499');
  assert.equal(params.mode, 'payment');
  assert.equal(params.client_reference_id, 'u1');
  assert.equal(params['metadata[uid]'], 'u1');
  assert.equal(params['metadata[season]'], '2026');
  assert.equal(params.customer_email, 'a@b.c');
  assert.equal(params['automatic_tax[enabled]'], 'true');
  assert.equal(s.checkoutSessionParams({ uid: 'u1', season: '2026' }, 'a', 'b').customer_email, undefined);
});
