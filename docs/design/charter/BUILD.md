# Charter — build plan

Undercut only. Track Limits is not part of this work.

This is the document the dev team builds from. Product decisions are closed. Do not reopen pricing, the second product, the 22-player cap, or the Rank Up rules while building.

Register the work with AIDLC before the first commit: `aidlc feature check "UC: Charter"`, then `aidlc feature add`, branch `feat/F-###-charter`. One feature is enough if the slices below land as commits on that branch. Conventional Commits. Before merge, run the model review on this machine (`aidlc:aidlc-spec`, `aidlc:aidlc-security`, `aidlc:aidlc-quality`, `aidlc:aidlc-ip`) and say so in the PR body.

Write a short ADR that records Charter as a second product beside ADR-001. ADR-001 stays the history of the personal pass. Do not edit it into the new shape.

## What ships

Two products.

| Product | Id | Price | Grant |
|---|---|---|---|
| Pit Wall Pass, already live | `pitwall.pass.season` | $14.99 | `users/{uid}.pass` for that account. Unchanged. |
| Charter, new | `pitwall.charter.season` | $39.99 | `leagues/{id}.charter` for one league, for one season. Every approved member can read paid Pit Wall while they remain in that league. |

A commissioner who runs two leagues buys twice. The personal pass does not charter a league. Charter does not grant a personal pass the buyer can carry to another league.

Season end matches the pass: `seasonExpiry()` in `functions/src/pitwall/pass.ts` (end of 31 January the following year). 2027 Charter is valid through 31 January 2028.

Cap stays 22 approved members (`DEFAULT_MAX_MEMBERS`, `FREE_LEAGUE_MEMBER_LIMIT` in `src/config/constants.ts`). Pending requests do not count. Do not sell `league.expansion`. Do not raise the cap. The +20 slot product stays retired.

Nothing is offered for sale while `PITWALL_CONTENT_OPEN` is true (`src/pitwall/gates.ts` and `web/pitwall/src/data/access.ts`). Charter checkout also requires `config/app.charter.enabled === true`. Default that flag to false. The ops flip, after 50 store ratings, is a separate change and is not part of this branch.

## Do not build

- A weekend pass, a standalone League Pro price, a capacity pack, a second-league fee.
- Ads, the influencer emails, the eight store screenshots, and the three videos. Those are marketing. This branch only has to make the screens those shots need.
- Amazon IAP. The pass is Stripe, Play, and Apple. Charter uses the same three.
- Any change that lets a client write `charter`, `pro`, `searchPoints`, or a Rank Up document.

## The entitlement trap

`grantPass()` in `functions/src/pitwall/passStore.ts` writes `users/{uid}.pass` and then calls `markOwnedLeaguesPro()`, which sets `pro: true` on every league that user owns. `revokePass()` deletes the pass, deletes every `pw_grants` row for that uid, and clears `pro` on every league they own.

Calling either function for a Charter member will do the wrong thing. A member who is granted through `grantPass` makes their own leagues Pro. A member who leaves, revoked through `revokePass`, loses a personal pass they paid for and loses Pro on leagues they own.

Charter access is a second field. The personal pass field is never written by a Charter purchase, a join, a leave, or a Charter refund.

```
users/{uid}.charterAccess = {
  leagues: { [leagueId]: expiresAt }
}
```

Access for paid Pit Wall reads is the later of `pass.expiresAt` and the latest `charterAccess.leagues` value.

`onUserPassWritten` in `functions/src/pitwall/index.ts` today returns early when `pass` is unchanged, and `stampClaim()` deletes the `pw` claim when the pass is null. Both have to change:

- The trigger runs when `pass` or `charterAccess` changes.
- `stampClaim` receives the later expiry of the two. It deletes `pw` only when both are absent or expired.
- A personal-pass revoke still clears `pass` and still clears `pro` on leagues that were Pro only because of that pass. It does not clear `charter` on a league that was bought, and it does not clear `charterAccess`.

`firestore.rules` `hasPass()` already checks `request.auth.token.pw`. Once the claim is the later of the two expiries, paid reads need no new rule. Restoring `allow read: if hasPass()` on `pw_pages`, `pw_entities`, and `pw_projections` stays the 50-rating flip. This branch does not flip it.

League Pro for the chartered league is `leagues/{id}.pro = true` and `proUntil` set to the charter expiry, written by the server on that league only. The personal pass keeps using `markOwnedLeaguesPro` for leagues the buyer owns. A member's Charter access does not call it.

## League document

Server-written. Client writes denied in `firestore.rules`.

```
leagues/{id}.charter = {
  season: "2027",
  expiresAt: number,
  buyerId: string,
  source: "stripe" | "play" | "apple",
  ref: string,
  purchasedAt: number
}
leagues/{id}.chartered = true          // query flag, cleared on expiry or refund
leagues/{id}.searchPoints = number     // sum of approved members, see below
leagues/{id}.rankUpsWeek = { weekId: string, count: number }
```

On a successful purchase the server also sets, on that league only:

- `isPublic = true`
- `settings.requireApproval = true`
- `pro = true`, `proUntil = charter.expiresAt`

While `charter.expiresAt` is in the future, rules reject a client update that clears `requireApproval`, sets `isPublic` false, or touches `charter`, `chartered`, `pro`, `proUntil`, `searchPoints`, or `rankUpsWeek`.

Refund or expiry clears `charter`, `chartered`, `pro`, and `proUntil` on that league, sets `isPublic` false and `requireApproval` false, and removes that league from every member's `charterAccess`. Members stay in the league. Their personal pass, if they have one, stays.

`searchPoints` is the sum, over approved members only, of `memberSeasonTotal()` in `functions/src/scoring/standingsFields.ts`. Recompute it wherever that total is written for a member, and when a member is approved, rejected, or removed. Pending members contribute nothing.

## Purchase

Add `pitwall.charter.season` next to the pass. Same spelling in every store and in Stripe metadata. Price $39.99, 3999 cents. Repeatable next season, same store types as the pass: Play one-time product, Apple non-renewing subscription. Setup steps follow `docs/store/pitwall-pass-setup.md`. Name on the sheet: `Charter`. Description: `Pit Wall for every player in one league, for the season.`

Files to extend, not replace:

- `src/config/products.ts` — new id, title, price, benefits.
- `functions/src/purchases/productGuards.ts` — add the id to `KNOWN_PRODUCTS`. Keep the path-traversal guard. A charter token must not be able to grant a pass, and a pass token must not be able to grant a charter.
- `functions/src/purchases/validatePurchase.ts` — the pass branch stays `grantPass`. The charter branch requires `leagueId`, checks the caller is `ownerId`, checks the league is not already chartered for this season, checks the flag, then writes `leagues/{id}.charter` and grants `charterAccess` to every currently approved member, including the owner. Idempotent on the purchase record id, the same way the pass is.
- `functions/src/pitwall/stripe.ts` — `checkoutSessionParams` and `webhookAction` learn a second product. Metadata carries `product`, `uid`, `season`, and `leagueId`. Amount 3999. The webhook grants charter on that league. A refund or dispute clears that league's charter only. It must not call `revokePass` for the buyer.
- `functions/src/pitwall/index.ts` — the checkout callable accepts `{ product: 'pitwall.charter.season', leagueId }`.

Create the league first, then pay. If the store sheet is dismissed, the league exists and is not chartered. The league page shows the offer. Do not delete the league on cancel.

The owner is the only buyer. Co-admins cannot buy.

## Join and approval

`joinLeague` in `src/services/league.service.ts` already writes `status: 'pending'` when `settings.requireApproval` is true, and `approveMember` / `rejectMember` already exist. Charter turns that flag on and locks it.

A code, a search result, and an email invite all create a pending member. Nothing writes `approved` except `approveMember`, and only the owner may call it. At 22 approved members, `approveMember` already throws. Keep that error and surface it on the sheet.

On approval of a chartered league, add the league to that user's `charterAccess`. On leave, reject, or owner remove, take it back. `onLeagueMemberWritten` in `functions/src/leagues/memberCount.ts` is the place to do both, so a client that deletes a member doc cannot leave the access behind.

The grid (`src/simple/grid`) has no approval UI. The old screen at `app/(tabs)/leagues/[id]/admin.tsx` does. Build the sheet in the grid. Do not send the owner back to the old tab.

## Rank Up

Chartered leagues only. One per approved member per ISO week. The week starts Monday 00:00 UTC. A missed week does not carry.

Callable `giveRankUp({ leagueId, toUid })`:

- Caller is an approved member.
- League is chartered and unexpired.
- `toUid` is a different approved member.
- Document id is `{weekId}_{fromUid}` under `leagues/{id}/rankUps`, so a second call in the same week fails.
- The call does not write `totalPoints`, `lockedPoints`, or `moonshotPoints`.
- It increments `rankUpsWeek.count` when `rankUpsWeek.weekId` matches, or resets the count to 1 when the week id differs.

Pure function, unit tested, no Firestore:

```
weekId(utcMs) -> "YYYY-Www"   // Monday 00:00 UTC

climb(count) -> min(count, 3)

orderChartered(leagues):
  by searchPoints desc, then id asc
  each league moves up climb(this week's count) places
  apply from the top of that points order, so two climbers do not swap twice
```

Non-chartered public leagues stay below, ordered by `memberCount` desc, which is what `getPublicLeagues` does today.

## Search

The grid has no public search. `leagueService.getPublicLeagues` queries `isPublic == true` ordered by `memberCount`, limit 20. That query cannot express the charter order.

Add a grid search screen, reached from the league empty state next to Join. It loads public leagues and sorts them with `orderChartered` on the client. Chartered rows show the red square, the points, the Rank Up count, and `UP n THIS WEEK` when the climb is more than zero. A full league (22) still appears. Its request path returns the full error.

Raise the read limit enough to sort before slicing. At launch a few dozen public leagues is the expected size. If the list passes 200, move the sort into a scheduled denormalized `searchRank` rather than loading them all. Do not build that until the count is real.

## App UI

Build in `src/simple/grid`, dark and light, the existing type and the red accent `#FF2E2E`. The square is an 8px rounded rect in that red, after the league name, everywhere a chartered league name is shown. Accessibility label `Charter`.

Copy is fixed.

**Create** (`GridLeagueManager`, step `create`), under the name field. Off by default.

> UNLOCK PIT WALL
> $39.99 for the season. Every player you add gets it. Your name is on it.

Button reads `CREATE LEAGUE`, or `CREATE AND UNLOCK · $39.99` when the card is on. Create, then start checkout.

**League page, owner, not chartered** (`GridLeaguePanel`), above the standings.

> PIT WALL IS NOT INCLUDED
> Unlock it for everyone in {league} for the season. $39.99.
> UNLOCK FOR THE LEAGUE

**Ceremony, owner, once, immediately after a successful purchase.**

> {LEAGUE} IS CHARTERED
> You covered every player in it. Pit Wall is included for the season. They ask you before they get in.
> SHARE

Share text:

```
{LEAGUE}  is chartered.
Pit Wall is on for everyone in it.
{Owner} paid for the season.

Ask to join with {CODE}
https://undercut.humannpc.com/join/{code}
```

**After that,** the owner card is:

> PIT WALL · ON
> You unlocked it for {league}.
> SHARE

Other members see one line under the standings header, with no price: `PIT WALL ON · {OWNER} PAID`.

**Request sheet, owner, one person at a time.**

> {NAME} WANTS IN
> {League} · {n} of 22
> APPROVE · DECLINE

Then:

> {NAME} IS IN
> Pit Wall is on for them because of you.

At 22, Approve is disabled and the sheet says the league is full.

**Joiner, after they ask and before approval.** `WAITING ON {OWNER}`

**Joiner, first open after approval, once per league.** Store `charterUnlockSeen` on the member doc so a reinstall does not show it again.

> PIT WALL IS ON
> {Owner} unlocked it for {League}. Projections, recommendations, and the lineup lab are yours this season.
> SEE THE LEAGUE
> YOURS WHILE YOU'RE IN {LEAGUE}

**Rank Up** sits on another player's standings row. Hidden on your own row. Label `RANK UP` until spent, then the count only. The public row shows `{count} RANK UPS`.

Hide every price and every purchase button while the charter flag is off.

## Email

Replace the body in `functions/src/invites/sendInviteEmail.ts`. The live template is teal and says "Leave Me To It". New mail is a black card, red accent `#FF2E2E`, one button, footer `Undercut`. Sender stays `theundercutapp@gmail.com`.

| Trigger | To | Subject | Button |
|---|---|---|---|
| Charter written | Owner | {League} is chartered | Share the league |
| Invite doc created and the league is chartered | Invitee | {Owner} chartered {League} | Ask to join |
| Member doc created with `pending`, league chartered | Owner | {Name} wants in to {League} | Approve |
| Member transitions to `approved`, league chartered | That player | You're in {League}. Pit Wall is on. | Open the league |
| Monday 14:00 UTC, chartered member, no Rank Up yet this week, `users.lastOpenAt` before Monday 00:00 UTC | That player | Your rank up is back | Give it |
| Scoring job finishes a race | Each approved member | {League} · {race} is scored | See the report |

The app writes `users.lastOpenAt` on foreground. Lock-in-one-hour and results-ready stay push notifications. Do not also email those.

An unchartered invite keeps a short version of the same template: league name, code, join link. No Pit Wall sentence.

## Tests

- Pure: `weekId` across a Sunday/Monday UTC boundary, `climb` at 0, 3, and 22, `orderChartered` with two climbers and a points tie.
- `stampClaim` keeps `pw` when the pass is removed and `charterAccess` remains, and drops it when both are gone.
- Charter grant does not write `users.pass` and does not set `pro` on a second league the buyer owns.
- Personal `revokePass` does not clear a charter the buyer bought.
- Leaving a chartered league removes that league from `charterAccess` and leaves a personal pass in place.
- Refund clears the league charter and member access, and does not call `revokePass`.
- `giveRankUp` rejects self, a non-member, a pending member, an unchartered league, and a second gift in the same week. It does not change points.
- Rules: a member cannot write `charter` or `requireApproval` while the league is chartered.
- Product guard: a Play token for `pitwall.pass.season` cannot grant charter, and the reverse.

## Order of work

1. ADR, types, rules, pure week/sort/claim helpers, and the tests above. No UI. Flag default false.
2. Purchase paths (Stripe, Play, Apple) writing charter and `charterAccess`. Checkout callable refuses while the flag is false.
3. Member trigger keeps `charterAccess` in step with approval, leave, and remove. Emails. `lastOpenAt`. Monday Rank Up mail.
4. Grid UI: create option, owner card, ceremony, approval sheet, joiner states, square, search, Rank Up.
5. Store console steps in a short doc next to `docs/store/pitwall-pass-setup.md`. Sandbox purchase on Play and Apple, one Stripe test payment, one refund. Do not activate the products in production until the flag flip.

## Done when

- A sandbox owner can charter one league, see the ceremony, and share the text above.
- A second account that joins with the code stays pending until the owner approves, then gets the unlock sheet once and can read a paid Pit Wall page.
- That account leaving loses the paid read and keeps a personal pass if they bought one.
- Search lists the chartered league above an unchartered public league, and a Rank Up moves it at most three places.
- The personal pass purchase still grants only `users.pass`, and a charter purchase still does not.

## Checked against the code (2026-11-24)

Added when slice 1 (F-175) was built from `origin/master`. The owner's text above is unchanged; where it and the code disagree, this list says what the code does today and what the build does about it.

- **The share link.** Every link in the code is `https://undercut.humannpc.com/join?code=CODE` (`GridLeagueManager`, `roundReportShare.ts`, `sendInviteEmail.ts`). There is no `/join/{code}` route. The share text must use `/join?code={code}`.
- **`league.expansion` is not retired.** It is still sold in the grid (the `LEAGUE SIZE` row in `GridLeagueManager`) and is still in `KNOWN_PRODUCTS` (`functions/src/purchases/productGuards.ts`). By an earlier owner decision the client may still raise `maxMembers` on update as the expansion fallback (the rules test that an owner can set 42 stands). Charter does not change the `maxMembers` rule or the expansion path. **Open owner question:** this plan says it is retired; it is live.
- **Amazon is already a live source for the personal pass** (`validatePurchase`, `PassSource` includes `amazon`). Charter uses only Stripe, Play and Apple, as above; the pass keeps Amazon.
- **Approval is written by the client today.** The league owner updates `members/{uid}.status` directly (the member update rule in `firestore.rules`), and `isApprovedLeagueMember` treats any status other than `pending` as approved. "Nothing writes `approved` except `approveMember`" needs a server callable and a member-rules change: that is slice 3. Slice 1 does not change the member rules.
- **The live invite email** is a dark card (`#161B22` on `#0D1117`) with a teal accent (`#14B8A6`), not a teal card. It does say "Leave Me To It".
- **The grid create step hardcodes `isPublic: false`** (`GridLeagueManager`, step `create`). Making a chartered league public at purchase is server work (slice 2); the create option is slice 4.
- **`users.lastOpenAt` does not exist yet.** Slice 3.
- **`stampClaim` before this change** deleted the `pw` claim whenever `passClaim()` returned null: no pass, or not a `pitwall` pass with a numeric expiry. (`passClaim` checks the pass against time 0, so an expired pass kept a past-dated claim, which `hasPass()` already rejects.) Slice 1 stamps the claim from `claimExpiry(pass, charterAccess, now)` instead, so it is deleted only when neither an unexpired pass nor unexpired charter access is left. The claim's shape is unchanged: one number, epoch seconds.
- **`revokePass` does not clear `proUntil`** (it sets `pro: false` only) **and it writes `pwRevoked`.** The Charter refund path must not reuse it (see "The entitlement trap"); a Charter refund clears `pro` and `proUntil` on its league itself.

What slice 1 built: `functions/src/charter/charter.ts` (`charterActive`, `charterAccessExpiry`, `claimExpiry`, `charterEnabled`), `functions/src/charter/rankUp.ts` (`weekId`, `climb`, `rankUpsThisWeek`, `orderChartered`), the claim change in `passStore.ts` and `onUserPassWritten`, the League and User types, and the rules (charter fields server-owned on create and update, a chartered league stays public with approval on, `charterAccess` server-owned, `rankUps` server-written). Choices made where this plan left room:

- `charterActive` needs both `chartered === true` and an unexpired `charter.expiresAt`; either alone is not a charter.
- "This week's count" is `rankUpsWeek.count` only when `rankUpsWeek.weekId === weekId(now)`; `now` is an argument.
- `orderChartered` walks the points order top-down and moves each league up its climb in the list as it stands at that moment. A league at the top cannot climb, so two climbers in first and second place end up swapped once (second passes first), never twice.
- Unchartered leagues are listed only when `isPublic === true`, by `memberCount` desc then id asc. A league with an expired charter or a cleared flag is listed with them.
- The rules lock on a chartered league checks only values that change: an update may leave `isPublic` or `requireApproval` as they are, but may not set either to anything other than `true`, or remove it, while `charter.expiresAt` is in the future.
