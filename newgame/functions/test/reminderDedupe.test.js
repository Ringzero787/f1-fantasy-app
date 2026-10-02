// Missing-picks reminder dedupe. Pure function; no Firestore reads.
// Run: npm --prefix newgame/functions run build && node --test newgame/functions/test/*.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const admin = require('firebase-admin');

// notifyMissingPicks builds its Firestore client at module load; a dummy app
// satisfies that. Nothing here touches the network.
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tracklimits-test' });
const { reminderStateFor } = require('../lib/notifications/notifyMissingPicks.js');

test('no stamp means nothing has been sent', () => {
  assert.deepEqual(reminderStateFor(undefined, 'bahrain_2026'), {});
  assert.deepEqual(reminderStateFor(null, 'bahrain_2026'), {});
  assert.deepEqual(reminderStateFor({}, 'bahrain_2026'), {});
  assert.deepEqual(reminderStateFor('nonsense', 'bahrain_2026'), {});
  assert.deepEqual(reminderStateFor(42, 'bahrain_2026'), {});
});

test('a keyed entry is read back for its own race only', () => {
  const stamp = { bahrain_2026: { early: true, last: false } };
  assert.deepEqual(reminderStateFor(stamp, 'bahrain_2026'), { early: true, last: false });
  assert.deepEqual(reminderStateFor(stamp, 'singapore_2026'), {});
});

// The 2026-10-02 regression: two races inside the 24h window shared one stamp,
// so each run overwrote the other and both resent every 30 minutes.
test('two races in the window keep independent stamps', () => {
  const stamp = {
    bahrain_2026: { early: true, last: false },
    singapore_2026: { early: false, last: false },
  };
  assert.deepEqual(reminderStateFor(stamp, 'bahrain_2026'), { early: true, last: false });
  assert.deepEqual(reminderStateFor(stamp, 'singapore_2026'), { early: false, last: false });
  // Neither race can mask the other.
  assert.notDeepEqual(
    reminderStateFor(stamp, 'bahrain_2026'),
    reminderStateFor(stamp, 'singapore_2026')
  );
});

test('the legacy single-race stamp is still honoured, so nobody is re-nagged', () => {
  const legacy = { raceId: 'bahrain_2026', early: true, last: false };
  assert.deepEqual(reminderStateFor(legacy, 'bahrain_2026'), { early: true, last: false });
  // …but only for the race it names.
  assert.deepEqual(reminderStateFor(legacy, 'singapore_2026'), {});
});

test('a keyed entry wins over a leftover legacy stamp on the same doc', () => {
  // After the upgrade a doc can carry both: the old flat keys plus new keyed
  // entries. The keyed entry must win, or the stale legacy value would shadow it.
  const mixed = {
    raceId: 'bahrain_2026',
    early: false,
    last: false,
    bahrain_2026: { early: true, last: true },
  };
  assert.deepEqual(reminderStateFor(mixed, 'bahrain_2026'), { early: true, last: true });
  // A race with no keyed entry falls through to the legacy stamp, which names a
  // different race, so nothing is reported as sent.
  assert.deepEqual(reminderStateFor(mixed, 'singapore_2026'), {});
});

test('missing or non-boolean flags are normalised to false, never truthy', () => {
  assert.deepEqual(reminderStateFor({ r: {} }, 'r'), { early: false, last: false });
  assert.deepEqual(reminderStateFor({ r: { early: 'yes', last: 1 } }, 'r'), { early: false, last: false });
  assert.deepEqual(reminderStateFor({ r: { early: true } }, 'r'), { early: true, last: false });
});
