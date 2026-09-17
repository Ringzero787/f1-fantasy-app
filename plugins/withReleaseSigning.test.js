// node --test plugins/*.test.js — where the release keystore password comes from.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { keystorePassword, readSigningEnv } = require('./withReleaseSigning');

const tmpEnv = (body) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'signing-')), '.signing.env');
  fs.writeFileSync(file, body);
  return file;
};
const missing = path.join(os.tmpdir(), 'no-such-dir', '.signing.env');

test('the environment wins over the file', () => {
  const file = tmpEnv('UC_KEYSTORE_PASSWORD=from-file\n');
  assert.equal(keystorePassword({ UC_KEYSTORE_PASSWORD: 'from-env' }, file), 'from-env');
});

test('the file is parsed as KEY=VALUE, comments skipped, values kept verbatim', () => {
  const file = tmpEnv('# comment\nTL_KEYSTORE_PASSWORD=zz+1\nUC_KEYSTORE_PASSWORD=ab+cd=ef\n');
  assert.equal(keystorePassword({}, file), 'ab+cd=ef');
  assert.equal(readSigningEnv(file).TL_KEYSTORE_PASSWORD, 'zz+1');
});

test('a missing password stops the prebuild with a pointer to where it goes', () => {
  assert.throws(() => keystorePassword({}, missing), /no UC_KEYSTORE_PASSWORD/);
});

test('a password that would break the Groovy string is refused', () => {
  assert.throws(() => keystorePassword({ UC_KEYSTORE_PASSWORD: "it's" }, missing), /cannot contain quotes/);
  assert.throws(() => keystorePassword({ UC_KEYSTORE_PASSWORD: 'a\\b' }, missing), /cannot contain quotes/);
});
