// F-128. The OpenF1 bearer token: exchanged from the two secrets, cached for its hour, renewed five
// minutes early, and never allowed to make a call worse than unauthenticated when it cannot be had.
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/ingestion/openf1Auth.js');
const client = require('../lib/ingestion/openf1Client.js');

const CREDS = { username: 'owner@example.com', password: 'hunter2' };
const T0 = Date.parse('2026-10-25T20:00:00Z');

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  json: async () => body,
});

/** A fetch stub that records every call and answers from a queue. */
function fetchStub(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const next = answers.shift();
    if (!next) throw new Error(`unexpected fetch ${url}`);
    if (next instanceof Error) throw next;
    return next;
  };
  fn.calls = calls;
  return fn;
}

test.beforeEach(() => {
  auth.forgetOpenf1Token();
  delete process.env.OPENF1_USERNAME;
  delete process.env.OPENF1_PASSWORD;
});

test('no credentials → null, and the token endpoint is never called', async () => {
  const f = fetchStub([]);
  assert.equal(await auth.openf1Token(null, f, T0), null);
  assert.equal(f.calls.length, 0);
  assert.equal(auth.openf1Credentials(), null, 'unbound secrets read as no credentials');
});

test('exchanges username + password for a bearer token, form-encoded, and caches it', async () => {
  const f = fetchStub([jsonResponse(200, { access_token: 'tok-1', expires_in: '3600', token_type: 'bearer' })]);
  assert.equal(await auth.openf1Token(CREDS, f, T0), 'tok-1');
  assert.equal(f.calls.length, 1);
  const [{ url, init }] = f.calls;
  assert.equal(url, auth.OPENF1_TOKEN_URL);
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(init.body, 'username=owner%40example.com&password=hunter2');
  // reused for the rest of the hour: no second exchange
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 30 * 60_000), 'tok-1');
  assert.equal(f.calls.length, 1);
  assert.equal(auth.openf1TokenCacheForTests().expiresAt, T0 + 3600_000);
});

test('renews five minutes before expiry, not after it', async () => {
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),
    jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }),
  ]);
  assert.equal(await auth.openf1Token(CREDS, f, T0), 'tok-1');
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 54 * 60_000), 'tok-1', 'six minutes left: still good');
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 56 * 60_000), 'tok-2', 'four minutes left: renewed');
  assert.equal(f.calls.length, 2);
});

test('a missing expires_in means an hour', async () => {
  const f = fetchStub([jsonResponse(200, { access_token: 'tok-1' })]);
  await auth.openf1Token(CREDS, f, T0);
  assert.equal(auth.openf1TokenCacheForTests().expiresAt, T0 + 3600_000);
});

test('a refused, malformed or failed exchange → null, nothing cached', async () => {
  for (const answer of [jsonResponse(401, { detail: 'bad credentials' }), jsonResponse(200, { token_type: 'bearer' }), new Error('ECONNRESET')]) {
    auth.forgetOpenf1Token();
    const f = fetchStub([answer]);
    assert.equal(await auth.openf1Token(CREDS, f, T0), null);
    assert.equal(auth.openf1TokenCacheForTests(), null);
  }
});

test('forgetting the token forces a new exchange', async () => {
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),
    jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }),
  ]);
  assert.equal(await auth.openf1Token(CREDS, f, T0), 'tok-1');
  auth.forgetOpenf1Token();
  assert.equal(await auth.openf1Token(CREDS, f, T0), 'tok-2');
});

test('the client sends the bearer token when the secrets are bound, and renews once on a 401', async () => {
  process.env.OPENF1_USERNAME = CREDS.username;
  process.env.OPENF1_PASSWORD = CREDS.password;
  const sessions = [{ session_key: 11396, session_name: 'Race' }];
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),   // exchange
    jsonResponse(401, { detail: 'expired' }),                          // sessions, token no longer honoured
    jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }),   // renewed
    jsonResponse(200, sessions),                                       // sessions again
  ]);
  const real = global.fetch;
  global.fetch = f;
  try {
    assert.deepEqual(await client.fetchSessions(2026), sessions);
  } finally {
    global.fetch = real;
  }
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls[1].init.headers.authorization, 'Bearer tok-1');
  assert.equal(f.calls[3].init.headers.authorization, 'Bearer tok-2');
  assert.match(f.calls[3].url, /\/v1\/sessions\?year=2026$/);
  assert.ok(f.calls[1].init.signal && f.calls[3].init.signal, 'F-129: every client request carries a timeout');
});

test('a second 401 with a fresh token is an error, not a loop', async () => {
  process.env.OPENF1_USERNAME = CREDS.username;
  process.env.OPENF1_PASSWORD = CREDS.password;
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),
    jsonResponse(401, {}),
    jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }),
    jsonResponse(401, {}),
  ]);
  const real = global.fetch;
  global.fetch = f;
  try {
    await assert.rejects(() => client.fetchSessions(2026), /OpenF1 API error: 401/);
  } finally {
    global.fetch = real;
  }
  assert.equal(f.calls.length, 4);
});

test('without the secrets the client calls as before: no authorization header, no retry on 401', async () => {
  const f = fetchStub([jsonResponse(401, { detail: 'Live F1 session in progress.' })]);
  const real = global.fetch;
  global.fetch = f;
  try {
    await assert.rejects(() => client.fetchSessions(2026), /OpenF1 API error: 401/);
  } finally {
    global.fetch = real;
  }
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].init.headers.authorization, undefined);
  assert.equal(f.calls[0].init.headers.accept, 'application/json');
});

test('a refused exchange is not retried for a minute, then is', async () => {
  const f = fetchStub([
    jsonResponse(401, { detail: 'bad credentials' }),
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),
  ]);
  assert.equal(await auth.openf1Token(CREDS, f, T0), null);
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 10_000), null, 'ten seconds on: no new attempt');
  assert.equal(f.calls.length, 1);
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 61_000), 'tok-1', 'after the minute: tried again');
  assert.equal(f.calls.length, 2);
});

test('a token response that is not JSON → null for a minute, body never thrown into a log', async () => {
  const f = fetchStub([{ ok: true, status: 200, statusText: '200', json: async () => { throw new SyntaxError('Unexpected token < in "<!DOCTYPE html>"'); } }]);
  assert.equal(await auth.openf1Token(CREDS, f, T0), null);
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 5_000), null);
  assert.equal(f.calls.length, 1);
});

test('a short-lived token renews at half-life, not on every call', async () => {
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 60 }),
    jsonResponse(200, { access_token: 'tok-2', expires_in: 60 }),
  ]);
  assert.equal(await auth.openf1Token(CREDS, f, T0), 'tok-1');
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 20_000), 'tok-1');
  assert.equal(await auth.openf1Token(CREDS, f, T0 + 31_000), 'tok-2');
  assert.equal(f.calls.length, 2);
});

test('concurrent callers on a cold instance share one exchange', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const f = async () => { await gate; return jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }); };
  let n = 0;
  const counting = async (...a) => { n++; return f(...a); };
  const both = Promise.all([auth.openf1Token(CREDS, counting, T0), auth.openf1Token(CREDS, counting, T0)]);
  release();
  assert.deepEqual(await both, ['tok-1', 'tok-1']);
  assert.equal(n, 1);
});

test('openf1Fetch: 401 with a token renews and retries once; a second 401 is returned', async () => {
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),
    jsonResponse(401, {}),
    jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }),
    jsonResponse(401, {}),
  ]);
  process.env.OPENF1_USERNAME = CREDS.username;
  process.env.OPENF1_PASSWORD = CREDS.password;
  const real = global.fetch;
  global.fetch = f;
  try {
    const res = await auth.openf1Fetch('https://api.openf1.org/v1/position?session_key=1', { signal: AbortSignal.timeout(1000) }, f);
    assert.equal(res.status, 401);
  } finally {
    global.fetch = real;
  }
  assert.equal(f.calls.length, 4);
  assert.equal(f.calls[1].init.headers.authorization, 'Bearer tok-1');
  assert.ok(f.calls[1].init.signal, 'the caller\'s init (timeout) is kept');
  assert.equal(f.calls[3].init.headers.authorization, 'Bearer tok-2');
});

test('the 429 retry carries the token, and the renewed one after a 401', async () => {
  process.env.OPENF1_USERNAME = CREDS.username;
  process.env.OPENF1_PASSWORD = CREDS.password;
  const sessions = [{ session_key: 1 }];
  const f = fetchStub([
    jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 }),
    jsonResponse(401, {}),
    jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }),
    jsonResponse(429, {}),
    jsonResponse(200, sessions),
  ]);
  const real = global.fetch;
  global.fetch = f;
  try {
    assert.deepEqual(await client.fetchSessions(2026), sessions);
  } finally {
    global.fetch = real;
  }
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls[3].init.headers.authorization, 'Bearer tok-2');
  assert.equal(f.calls[4].init.headers.authorization, 'Bearer tok-2');
});

test('every function that reaches OpenF1 binds both secrets', () => {
  const admin = require('firebase-admin');
  if (admin.apps.length === 0) admin.initializeApp({ projectId: 'demo-f128' });
  const bound = {
    ...require('../lib/ingestion/checkResults.js'),
    ...require('../lib/ingestion/syncSchedule.js'),
    ...require('../lib/ingestion/scheduleMonitor.js'),
    ...require('../lib/moonshot/liveSweep.js'),
  };
  for (const name of ['checkOpenF1Results', 'checkQualifyingResults', 'checkSprintResults', 'syncRaceSchedules', 'monitorScheduleChanges', 'moonshotLiveSweep']) {
    const keys = (bound[name].__endpoint.secretEnvironmentVariables || []).map((s) => s.key).sort();
    assert.deepEqual(keys, ['OPENF1_PASSWORD', 'OPENF1_USERNAME'], name);
  }
});
