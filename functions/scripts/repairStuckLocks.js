/**
 * Repair for the Phase 5 dotted-key unlock bug.
 *
 * onRaceCompleted Phase 5 wrote its unlock schedule through commitInBatches,
 * which uses set({merge:true}). Unlike update(), set does NOT treat dots as
 * path separators, so 'lockStatus.nextUnlockTime' became a LITERAL field of
 * that name. The real nested lockStatus.nextUnlockTime kept autoLockTeams'
 * race-start+24h failsafe, and autoUnlockTeams — which queries the nested path
 * — never saw the intended completion+3h unlock. Teams stayed locked ~18h too
 * long after every race.
 *
 * The code fix is in functions/src/scoring/calculatePoints.ts (Phase 5 now
 * writes a nested map, and commitInBatches expands any dotted key as a
 * backstop). This script cleans up the docs that bug already wrote:
 *   - unlocks teams whose intended unlock time has passed (exactly what
 *     autoUnlockTeams would have done), skipping season-locked teams
 *   - deletes the two literal dotted fields
 *
 * Usage:
 *   node scripts/repairStuckLocks.js            # dry run, writes nothing
 *   node scripts/repairStuckLocks.js --apply    # perform the repair
 */

const admin = require('firebase-admin');
const KEY = process.env.SA_KEY || '/mnt/smb/f1-app/files/f1-app-18077-firebase-adminsdk-fbsvc-2b824e0c37.json';
admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();
const { FieldPath, FieldValue, Timestamp } = admin.firestore;

const APPLY = process.argv.includes('--apply');
const LITERAL_UNLOCK = 'lockStatus.nextUnlockTime';
const LITERAL_REASON = 'lockStatus.lockReason';

(async () => {
  const now = Timestamp.now();
  const snap = await db.collection('fantasyTeams').get();

  const toUnlock = [];
  const toCleanOnly = [];

  for (const doc of snap.docs) {
    const t = doc.data();
    const hasLiteral = Object.prototype.hasOwnProperty.call(t, LITERAL_UNLOCK)
      || Object.prototype.hasOwnProperty.call(t, LITERAL_REASON);
    if (!hasLiteral) continue;

    // Same skip autoUnlockTeams applies.
    if (t.lockStatus && t.lockStatus.isSeasonLocked) continue;

    const intended = t[LITERAL_UNLOCK];
    const due = intended && typeof intended.toMillis === 'function'
      ? intended.toMillis() <= now.toMillis()
      : false;

    const row = {
      id: doc.id,
      name: t.name || '(unnamed)',
      isLocked: t.isLocked === true,
      intended: intended && intended.toDate ? intended.toDate().toISOString() : null,
      nested: t.lockStatus && t.lockStatus.nextUnlockTime && t.lockStatus.nextUnlockTime.toDate
        ? t.lockStatus.nextUnlockTime.toDate().toISOString() : null,
    };

    if (t.isLocked === true && due) toUnlock.push(row);
    else toCleanOnly.push(row);
  }

  console.log(`\n=== repairStuckLocks (${APPLY ? 'APPLY' : 'DRY RUN'}) — now ${now.toDate().toISOString()} ===\n`);
  console.log(`Locked and overdue — will be unlocked: ${toUnlock.length}`);
  for (const r of toUnlock) {
    console.log(`   ${r.name.padEnd(28)} intended=${r.intended}  nested(failsafe)=${r.nested}`);
  }
  console.log(`\nStale literal fields only (already unlocked / not yet due): ${toCleanOnly.length}`);
  for (const r of toCleanOnly) {
    console.log(`   ${r.name.padEnd(28)} isLocked=${r.isLocked} intended=${r.intended}`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to perform the repair.');
    process.exit(0);
  }

  let done = 0;
  for (const r of [...toUnlock, ...toCleanOnly]) {
    const ref = db.collection('fantasyTeams').doc(r.id);
    const unlocking = toUnlock.some(u => u.id === r.id);

    // update() (not set/merge) so the nested paths below really are paths, and
    // so FieldPath can address the literal dotted field names for deletion.
    const args = [];
    if (unlocking) {
      args.push(
        'isLocked', false,
        new FieldPath('lockStatus', 'canModify'), true,
        new FieldPath('lockStatus', 'lockReason'), null,
        new FieldPath('lockStatus', 'nextUnlockTime'), null,
      );
    }
    args.push(new FieldPath(LITERAL_UNLOCK), FieldValue.delete());
    args.push(new FieldPath(LITERAL_REASON), FieldValue.delete());

    await ref.update(...args);
    done++;
  }

  console.log(`\nRepaired ${done} team doc(s): ${toUnlock.length} unlocked, ${toCleanOnly.length} cleaned.`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
