/**
 * The decisions behind a Play publish.
 *
 * A mistake here ships a build to every Android user, and the dangerous ones are all mundane: a
 * flag typed with a space instead of an equals sign, a track that falls back to a default, a
 * version code that is really a file path. None of it is caught by anything else — the script talks
 * to Google, so there is no safe way to exercise the whole thing in CI.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { TRACKS, unknownFlag, resolveTrack, productionGuard, validVersionCode, releaseFor } = require('./_play');

const PKG = 'com.undercut.app';

test('a flag typed with a space is refused, not dropped', () => {
  // The whole point: `--track internal` must never leave the track unset and fall back to anything.
  assert.equal(unknownFlag(['promote', '63', '--track', 'internal']), '--track');
  assert.equal(unknownFlag(['--trak=internal']), '--trak=internal');
  assert.equal(unknownFlag(['--apply']), null);
  assert.equal(unknownFlag(['upload', 'a.aab', '--track=internal', '--notes=hi', '--apply']), null);
});

test('positional arguments are left alone', () => {
  assert.equal(unknownFlag(['promote', '63']), null);
  assert.equal(unknownFlag(['upload', '/path/to/app-release.aab']), null);
});

test('there is no default track, because the one worth guessing wrong reaches every user', () => {
  assert.match(resolveTrack([]).error, /no --track/);
  assert.match(resolveTrack(['--track=prod']).error, /not a track/);
  assert.equal(resolveTrack(['--track=production']).track, 'production');
  for (const t of TRACKS) assert.equal(resolveTrack([`--track=${t}`]).track, t);
});

test('a track can never reach the request path unless it is one we know', () => {
  // It is interpolated into an authenticated URL, so a traversal must not survive the parse.
  assert.ok(resolveTrack(['--track=../../../else']).error);
  assert.ok(resolveTrack(['--track=']).error);
});

test('production asks twice', () => {
  assert.match(productionGuard('production', [], PKG), /--confirm=com\.undercut\.app/);
  assert.match(productionGuard('production', ['--confirm=wrong'], PKG), /--confirm=/);
  assert.equal(productionGuard('production', [`--confirm=${PKG}`], PKG), null);
});

test('every other track does not', () => {
  for (const t of ['internal', 'alpha', 'beta']) assert.equal(productionGuard(t, [], PKG), null);
});

test('a version code is digits, so a path or a flag is caught', () => {
  assert.ok(validVersionCode('63'));
  assert.ok(!validVersionCode('--track=production'));
  assert.ok(!validVersionCode('v63'));
  assert.ok(!validVersionCode('0'));
  assert.ok(!validVersionCode(''));
  assert.ok(!validVersionCode(63));
});

test('the release is shaped the way Play wants it', () => {
  // versionCodes are strings in this API even though a bundle reports its code as a number. If that
  // ever silently became a number, Play would reject the edit at commit, after the upload.
  const r = releaseFor(63, 'notes here');
  assert.deepEqual(r.versionCodes, ['63']);
  assert.equal(typeof r.versionCodes[0], 'string');
  assert.equal(r.status, 'completed');
  assert.deepEqual(r.releaseNotes, [{ language: 'en-US', text: 'notes here' }]);
});

test('a release with no notes carries no empty notes field', () => {
  assert.equal(releaseFor(63, '').releaseNotes, undefined);
  assert.equal(releaseFor('63').releaseNotes, undefined);
});
