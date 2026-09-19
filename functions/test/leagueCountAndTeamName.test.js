// Runs against the compiled output: `npm --prefix functions run build && node --test functions/test`.
const test = require('node:test');
const assert = require('node:assert/strict');
// lib/index.js initialises firebase-admin exactly as the deployed bundle does; load it first.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-uc-test';
process.env.FIREBASE_CONFIG = process.env.FIREBASE_CONFIG || JSON.stringify({ projectId: 'demo-uc-test', storageBucket: 'demo-uc-test.appspot.com' });
const index = require('../lib/index.js');
const { countsAsMember, approvedMemberCount, membershipChanged } = require('../lib/leagues/memberCount.js');
const { normalizeTeamName, isTakenBy } = require('../lib/teams/teamName.js');
const { isUnusedExpansion } = require('../lib/purchases/leagueExpansion.js');

test('only approved members count; docs without a status are approved', () => {
  assert.equal(countsAsMember({ role: 'owner' }), true);
  assert.equal(countsAsMember({ status: 'approved' }), true);
  assert.equal(countsAsMember({ status: 'pending' }), false);
  assert.equal(countsAsMember(undefined), false);
  assert.equal(approvedMemberCount([{ role: 'owner' }, { status: 'approved' }, { status: 'pending' }]), 2);
  assert.equal(approvedMemberCount([]), 0);
});

test('membershipChanged fires on join, leave and approval, not on rank or name edits', () => {
  assert.equal(membershipChanged(undefined, { status: 'approved' }), true);   // join
  assert.equal(membershipChanged({ status: 'approved' }, undefined), true);   // leave
  assert.equal(membershipChanged({ status: 'pending' }, { status: 'approved' }), true); // approval
  assert.equal(membershipChanged(undefined, { status: 'pending' }), false);   // pending join does not count yet
  assert.equal(membershipChanged({ status: 'pending' }, undefined), false);   // rejected request
  assert.equal(membershipChanged({ status: 'approved', rank: 2 }, { status: 'approved', rank: 1 }), false);
});

test('team names are trimmed and bounded', () => {
  assert.equal(normalizeTeamName('  Apex Predators '), 'Apex Predators');
  assert.equal(normalizeTeamName('A'), null);
  assert.equal(normalizeTeamName('x'.repeat(31)), null);
  assert.equal(normalizeTeamName(42), null);
});

test('a name is taken by any team except the one being renamed', () => {
  assert.equal(isTakenBy([], null), false);
  assert.equal(isTakenBy(['t1'], null), true);
  assert.equal(isTakenBy(['t1'], 't1'), false);        // renaming to its own name
  assert.equal(isTakenBy(['t1', 't2'], 't1'), true);   // someone else has it too
});

test('an expansion purchase is spendable once: validated, right product, not yet applied', () => {
  assert.equal(isUnusedExpansion({ productId: 'league.expansion', status: 'validated' }), true);
  assert.equal(isUnusedExpansion({ productId: 'league.expansion', status: 'applied', appliedToLeagueId: 'L1' }), false);
  assert.equal(isUnusedExpansion({ productId: 'league.expansion', status: 'validated', appliedToLeagueId: 'L1' }), false);
  assert.equal(isUnusedExpansion({ productId: 'avatar.pack', status: 'validated' }), false);
  assert.equal(isUnusedExpansion(undefined), false);
});

test('Play purchases are verified against the package the app ships as', () => {
  const { PLAY_PACKAGE_NAME } = require('../lib/purchases/validatePurchase.js');
  const appConfig = require('../../app.config.js');
  assert.equal(PLAY_PACKAGE_NAME, appConfig.expo.android.package);
  assert.equal(PLAY_PACKAGE_NAME, 'com.undercut.app');
});

test('the member-count triggers listen on the right documents, retry, and are exported for deploy', () => {
  const path = (fn) => fn.__endpoint.eventTrigger.eventFilterPathPatterns.document;
  assert.equal(path(index.onLeagueMemberWritten), 'leagues/{leagueId}/members/{memberId}');
  assert.equal(path(index.onLeagueMemberCountChanged), 'leagues/{leagueId}');
  assert.match(index.onLeagueMemberWritten.__endpoint.eventTrigger.eventType, /document\.v1\.written$/);
  assert.match(index.onLeagueMemberCountChanged.__endpoint.eventTrigger.eventType, /document\.v1\.updated$/);
  assert.equal(index.onLeagueMemberWritten.__endpoint.eventTrigger.retry, true);
  assert.equal(index.onLeagueMemberCountChanged.__endpoint.eventTrigger.retry, true);
  assert.ok(index.reconcileAllLeagueMemberCounts.__endpoint.scheduleTrigger);
  assert.equal(typeof index.checkTeamNameAvailable, 'function');
  assert.equal(typeof index.applyLeagueExpansion, 'function');
});
