// Runs against the SOURCE, not the compiled output, because what it pins is a shape.
//
// `handleQualifyingScoring` and `handleSprintScoring` each walk every team, write its
// points, and push an entry onto `pointsUpdates`. Two things depend on that write
// happening for every team the handler scored, not only the ones that scored something:
//
//  • `scoredRaces` gains `quali_<raceId>` / `sprint_<raceId>`. That marker is the
//    handler's own idempotency guard, and under F-098 it is also what reopens the ace
//    between qualifying and the race. A team that scored nothing and never got it was
//    re-scored on every run and lost the ace window for the weekend.
//  • `pointsUpdates` is the only source of `affectedLeagues`, so a league missing from it
//    has its members' totalPoints and ranks left stale until Sunday.
//
// Both have been broken here, in opposite directions and within a day of each other: the
// marker sat inside `if (teamPoints !== 0)`, and the fix for that put the
// `pointsUpdates.push` inside the new `else` — so the standings sync then ran only for
// leagues containing a zero-scoring team. Neither failed a test, because exercising these
// handlers needs a Firestore fake this repo does not have. Until it does, the shape is
// what there is to guard, in the same spirit as __tests__/store/iapWiring.test.ts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'scoring', 'calculatePoints.ts');
const source = fs.readFileSync(SRC, 'utf8');

/** The body of one handler, from its declaration to the next top-level declaration. */
function handler(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `${name} is gone from calculatePoints.ts — this test needs updating with it`);
  const after = source.slice(start + 1);
  const next = after.search(/\n(?:export )?(?:async function|function|const) [A-Za-z]/);
  assert.notEqual(next, -1, `could not find where ${name} ends`);
  return source.slice(start, start + 1 + next);
}

for (const [name, marker] of [
  ['handleQualifyingScoring', 'qualiScoredKey'],
  ['handleSprintScoring', 'sprintScoredKey'],
]) {
  test(`${name} scores every team it walks, not only the ones that scored points`, () => {
    const body = handler(name);
    assert.ok(
      !/if\s*\(\s*teamPoints\s*!==\s*0\s*\)/.test(body),
      `${name} gates its team write on teamPoints !== 0 again. A blank session must still ` +
      `record ${marker} in scoredRaces: it is the idempotency guard and the ace-freeze gap.`,
    );
    assert.match(body, new RegExp(`arrayUnion\\(${marker}\\)`), `${name} must record ${marker}`);
  });

  test(`${name} counts every scored team towards the league sync`, () => {
    const body = handler(name);
    const pushes = body.match(/pointsUpdates\.push\(/g) ?? [];
    assert.equal(pushes.length, 1, `${name} should push exactly once per team; found ${pushes.length}`);
    // Nothing may sit between the end of the write's try/catch and the push — an `else`
    // there is how the standings sync was lost.
    const at = body.indexOf('pointsUpdates.push(');
    const between = body.slice(body.lastIndexOf('continue;', at), at);
    assert.ok(
      !/\belse\b/.test(between),
      `${name} pushes to pointsUpdates from inside a branch. affectedLeagues comes from ` +
      `that array, so any team left out leaves its league's standings stale.`,
    );
  });
}
