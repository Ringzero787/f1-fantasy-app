// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
//
// F-176: a whole lineup change in one call. The steps keep the single-move callables' rules: the
// same sale quote, banking, lockouts, contract caps and budget check, in the same order.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../lib/teams/lineupSteps.js');

const clock = { completedRaceCount: 10, racesLeft: 14 };
const held = (id, extra = {}) => ({ driverId: id, name: id, purchasePrice: 200, currentPrice: 200, pointsScored: 40, racesHeld: 2, contractLength: 3, addedAtRace: 8, ...extra });
const team = (extra = {}) => ({
  drivers: [held('ver'), held('ham'), held('nor', { racesHeld: 0, pointsScored: 0 })],
  constructor: { constructorId: 'mcl', name: 'McLaren', purchasePrice: 300, currentPrice: 300, pointsScored: 25, racesHeld: 1, contractLength: 3 },
  budget: 100, totalSpent: 900, aceDriverId: 'ver', aceConstructorId: 'mcl', ...extra,
});
const maps = (drivers = {}, constructors = {}) => ({ drivers: new Map(Object.entries(drivers)), constructors: new Map(Object.entries(constructors)) });

test('the sale quote is the single-move one: 3% a race left, waived in the grace period and for reserve picks', () => {
  assert.deepEqual(L.quoteSale({ racesHeld: 2, contractLength: 3 }, 200), { marketPrice: 200, earlyTermFee: 6, saleReturn: 194, feeWaived: false });
  assert.equal(L.quoteSale({ racesHeld: 0, contractLength: 3 }, 200).feeWaived, true);
  assert.equal(L.quoteSale({ racesHeld: 1, contractLength: 3, isReservePick: true }, 200).earlyTermFee, 0);
  assert.equal(L.quoteSale({ racesHeld: 3, contractLength: 3 }, 200).feeWaived, true, 'contract run out');
  // one copy of the rules: the single-move callables run the same steps and keep no rules of their own
  const ops = fs.readFileSync(path.join(__dirname, '..', 'src', 'teams', 'teamOperations.ts'), 'utf8');
  assert.doesNotMatch(ops, /EARLY_TERMINATION_RATE\s*=|function quoteSale\(|function getTeamCtor\(|const TEAM_SIZE\s*=/);
  for (const [callable, step] of [['addDriverSecure', 'buyDriver('], ['removeDriverSecure', 'sellDriver('], ['setConstructorSecure', 'buyConstructor('], ['removeConstructorSecure', 'sellConstructor(']]) {
    const body = ops.slice(ops.indexOf(`export const ${callable}`));
    assert.ok(body.slice(0, body.indexOf('\n});')).includes(step), `${callable} runs ${step}`);
  }
});

test('sell two, buy one: banks the points, clears the ace, prices at the market, stamps the streak', () => {
  const s = L.startState(team(), 1000);
  const out = L.applyPlan(s, { sellDrivers: ['ver', 'nor'], sellConstructor: false, buyConstructor: null, buyDrivers: [{ id: 'pia', contractLength: 4 }] },
    maps({ ver: { price: 250 }, nor: { price: 180 }, pia: { id: 'pia', name: 'Piastri', price: 300, constructorId: 'mcl' } }), clock);
  // ver: 250 at 2 of 3 held -> fee floor(250*0.03*1)=7, return 243; nor: grace, return 180
  assert.equal(s.budget, 100 + 243 + 180 - 300);
  assert.equal(s.totalSpent, 900 - 200 - 200 + 300);
  assert.equal(s.banked, 40, 'ver had 40, nor 0');
  assert.equal(s.aceDriverId, null, 'the ace was sold');
  assert.equal(s.aceConstructorId, 'mcl');
  assert.deepEqual(s.drivers.map((d) => d.driverId), ['ham', 'pia']);
  assert.equal(out.boughtDrivers[0].contractLength, 4);
  assert.equal(out.boughtDrivers[0].addedAtRace, 10);
  assert.equal(s.driverStreaksTouched, true);
  assert.deepEqual(s.sales.map((x) => [x.id, x.saleReturn, x.earlyTermFee]), [['ver', 243, 7], ['nor', 180, 0]]);
});

test('a constructor swap sells the held one first, at its market price, then buys', () => {
  const s = L.startState(team(), 1000);
  const out = L.applyPlan(s, { sellDrivers: [], sellConstructor: false, buyConstructor: { id: 'fer', contractLength: 9 }, buyDrivers: [] },
    maps({}, { mcl: { price: 320 }, fer: { name: 'Ferrari', price: 400 } }), clock);
  // mcl 1 of 3 held: fee floor(320*0.03*2)=19, return 301
  assert.equal(s.budget, 100 + 301 - 400);
  assert.equal(s.banked, 25);
  assert.equal(s.aceConstructorId, null);
  assert.equal(out.boughtConstructor.constructorId, 'fer');
  assert.equal(out.boughtConstructor.contractLength, 6, 'clamped to the maximum, not refused');
  assert.throws(() => L.applyPlan(L.startState(team(), 1000), { sellDrivers: [], sellConstructor: false, buyConstructor: { id: 'mcl' }, buyDrivers: [] }, maps({}, { mcl: { price: 300 } }), clock), /already on team/);
  const sold = L.startState(team(), 1000);
  L.applyPlan(sold, { sellDrivers: [], sellConstructor: true, buyConstructor: null, buyDrivers: [] }, maps({}, { mcl: { price: 300 } }), clock);
  assert.equal(sold.constructor, null);
});

test('every refusal of the single moves still applies, and stops the whole plan', () => {
  const run = (plan, d = {}, c = {}, t = team()) => L.applyPlan(L.startState(t, 1000), { sellDrivers: [], sellConstructor: false, buyConstructor: null, buyDrivers: [], ...plan }, maps(d, c), clock);
  assert.throws(() => run({ sellDrivers: ['xxx'] }), /Driver not on team/);
  assert.throws(() => run({ buyDrivers: [{ id: 'pia' }] }, { pia: { name: 'P', price: 101 } }), /Cannot afford P \(\$101\)\. Budget: \$100/);
  assert.throws(() => run({ buyDrivers: [{ id: 'pia' }] }, { pia: { name: 'P', price: 1, isActive: false } }), /not active/);
  assert.throws(() => run({ buyDrivers: [{ id: 'pia' }] }, {}), /Driver not found/);
  assert.throws(() => run({ buyDrivers: [{ id: 'ham' }] }, { ham: { price: 1 } }), /already on team/);
  assert.throws(() => run({ buyDrivers: [{ id: 'pia' }] }, { pia: { price: 1 } }, {}, team({ driverLockouts: { pia: 11 } })), /locked out after contract expiry/);
  const full = team({ drivers: ['a', 'b', 'c', 'd', 'e'].map((x) => held(x)), budget: 999 });
  assert.throws(() => run({ buyDrivers: [{ id: 'pia' }] }, { pia: { price: 1 } }, {}, full), /Team is full/);
  // six in a row (F-169): sold and re-bought in the same window continues the run
  const streaked = team({ drivers: [held('ver', { racesHeld: 6, addedAtRace: 4 })] });
  assert.throws(() => run({ sellDrivers: ['ver'], buyDrivers: [{ id: 'ver' }] }, { ver: { name: 'Verstappen', price: 100 } }, {}, streaked), /6 races in a row/);
  // the budget is checked after the sales, as the single moves sent in this order would be
  const ok = L.startState(team(), 1000);
  L.applyPlan(ok, { sellDrivers: ['ham'], sellConstructor: false, buyConstructor: null, buyDrivers: [{ id: 'pia' }] }, maps({ ham: { price: 200 }, pia: { price: 290 } }), clock);
  assert.equal(ok.budget, 100 + 194 - 290);
});

test('the request is checked before any read', () => {
  assert.throws(() => L.parsePlan({}), /Nothing to change/);
  assert.throws(() => L.parsePlan({ sellDrivers: ['a/b'] }), /ids/);
  assert.throws(() => L.parsePlan({ sellDrivers: ['a', 'a'] }), /Duplicate/);
  assert.throws(() => L.parsePlan({ buyDrivers: [{ id: 'a' }, { id: 'a' }] }), /Duplicate/);
  assert.throws(() => L.parsePlan({ buyDrivers: new Array(6).fill(0).map((_, i) => ({ id: `d${i}` })) }), /up to 5/);
  assert.throws(() => L.parsePlan({ buyConstructor: { id: '' } }), /needs an id/);
  assert.throws(() => L.requestedLength(0), /at least 1/);
  assert.equal(L.requestedLength(undefined), 3);
  assert.deepEqual(L.parsePlan({ sellConstructor: true }), { sellDrivers: [], sellConstructor: true, buyConstructor: null, buyDrivers: [] });
});

test('the app saves in one call, with the single moves kept for demo mode and a build that beats the deploy', () => {
  const root = path.join(__dirname, '..', '..');
  const picker = fs.readFileSync(path.join(root, 'src', 'simple', 'grid', 'GridPickerScreen.tsx'), 'utf8');
  assert.match(picker, /await store\.applyLineup\(\{/);
  assert.ok(picker.indexOf('await store.applyLineup(') < picker.indexOf("store.removeDriver(s.id)"));
  const svc = fs.readFileSync(path.join(root, 'src', 'services', 'team.service.ts'), 'utf8');
  assert.match(svc, /httpsCallable\(functions, 'applyLineupSecure'\)/);
  const ops = fs.readFileSync(path.join(__dirname, '..', 'src', 'teams', 'teamOperations.ts'), 'utf8');
  assert.match(ops, /tx\.set\(teamRef, updateData, \{ mergeFields: Object\.keys\(updateData\) \}\)/);
  assert.match(ops, /export const applyLineupSecure = functions\.runWith\(\{ memory: '512MB' \}\)/);
});

test('edge cases the review asked for', () => {
  const plan = (p) => ({ sellDrivers: [], sellConstructor: false, buyConstructor: null, buyDrivers: [], ...p });
  // a swap banks a NEGATIVE constructor total too, as removeConstructorSecure always has
  const neg = L.startState(team({ constructor: { constructorId: 'mcl', purchasePrice: 300, pointsScored: -12, racesHeld: 1, contractLength: 3 } }), 1000);
  L.applyPlan(neg, plan({ buyConstructor: { id: 'fer' } }), maps({}, { mcl: { price: 300 }, fer: { price: 300 } }), clock);
  assert.equal(neg.banked, -12);
  // a driver with no price doc sells at the price held
  const noDoc = L.startState(team(), 1000);
  L.applyPlan(noDoc, plan({ sellDrivers: ['nor'] }), maps({}), clock);
  assert.equal(noDoc.budget, 100 + 200, 'grace period: the full held price');
  // a swap whose new constructor is missing or inactive
  assert.throws(() => L.applyPlan(L.startState(team(), 1000), plan({ buyConstructor: { id: 'fer' } }), maps({}, { mcl: { price: 300 } }), clock), /Constructor not found/);
  assert.throws(() => L.applyPlan(L.startState(team(), 1000), plan({ buyConstructor: { id: 'fer' } }), maps({}, { mcl: { price: 300 }, fer: { price: 1, isActive: false } }), clock), /not active/);
  // a swap affordable only after the held one's sale
  const tight = L.startState(team({ budget: 0 }), 1000);
  L.applyPlan(tight, plan({ buyConstructor: { id: 'fer' } }), maps({}, { mcl: { price: 320 }, fer: { price: 301 } }), clock);
  assert.equal(tight.budget, 0);
  // sellConstructor alongside a buy is the buy's own sale, done once
  const both = L.startState(team(), 1000);
  L.applyPlan(both, plan({ sellConstructor: true, buyConstructor: { id: 'fer' } }), maps({}, { mcl: { price: 320 }, fer: { price: 300 } }), clock);
  assert.equal(both.sales.length, 1);
  // sold and re-bought in one call: the run carries over (F-169), the sale fee is still charged
  const again = L.startState(team(), 1000);
  const out = L.applyPlan(again, plan({ sellDrivers: ['ver'], buyDrivers: [{ id: 'ver', contractLength: 6 }] }), maps({ ver: { price: 250 } }), clock);
  assert.equal(out.boughtDrivers[0].streakBefore, 2);
  assert.equal(out.boughtDrivers[0].contractLength, 4, 'six in a row at most: 2 held + 4');
  assert.equal(again.sales[0].earlyTermFee, 7);
  // a team without a budget field starts from the default, on a sale as on a buy
  const noBudget = L.startState(team({ budget: undefined }), 1000);
  L.applyPlan(noBudget, plan({ sellDrivers: ['nor'] }), maps({ nor: { price: 180 } }), clock);
  assert.equal(noBudget.budget, 1180);
});
