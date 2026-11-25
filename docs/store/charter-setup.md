# Setting up Charter in Google Play and the App Store

Charter (F-175) is the second Pit Wall product: **$39.99**, one league, one season, bought by the league owner. It sits beside the Pit Wall Pass (`docs/store/pitwall-pass-setup.md`), which is unchanged.

The product id is the same everywhere and must match exactly. The server keys the grant on it:

```
pitwall.charter.season
```

| Field | Value |
|---|---|
| Name on the payment sheet | `Charter` |
| Description | `Pit Wall for every player in one league, for the season.` |
| Price | **$39.99** (Stripe: 3999 cents) |
| Play type | One-time product (in-app product), consumed after validation, like the pass |
| Apple type | **Non-Renewing Subscription**, like the pass |
| Amazon | **None.** Charter is not sold on Amazon (BUILD.md, "Do not build") |
| Stripe | Nothing to create: checkout sends the price inline |

## What creating the products does and does not do

- **Creating them sells nothing.** The app has no Charter button until slice 4. The server charters only when `config/app.charter.enabled` is `true`. The exception is a store **test** purchase by an account marked `testAccount`, which is how the sandbox runs.
- **A real purchase made while the flag is off is recorded, not applied.** It sits on the purchase record as `charterApplied: false`, `charterRefused: disabled`, and support refunds it. With no button in the app, nobody can reach one.
- **The product id cannot be changed or reused** on either store. Check it before saving.
- **The display name "Charter" is still waiting on a trademark search** (spec F-175, slice 5). The display name can be changed later; the id cannot. That is why the id carries no brand.

## Before you start

1. **Apple's Paid Applications agreement must be active.** App Store Connect → Business → Agreements, Tax, and Banking. A lapsed agreement shows up as "cannot locate the In-App Purchases".
2. **Play's purchase verification permission** is already in place for the pass. Charter is verified by the same `validatePurchase` function and service account. Nothing new to grant.
3. **Test buyers must be marked `testAccount` in Firestore** (F-164). Otherwise their sandbox or license-tester purchase is refused. The App Review accounts already are. A new tester account is marked by running `markTestAccounts` through `aidlc op` after they sign in once.

---

## Google Play Console

### Prompt for Claude in Chrome

Paste this into Claude in Chrome with Play Console open and signed in:

```
You are setting up a new in-app product in Google Play Console for the app "Undercut"
(package com.undercut.app). Work only inside that app. Do not change any other product,
price, track, or setting.

1. Go to Monetize with Play → Products → One-time products (older consoles: In-app products).
   First list the existing product IDs you see, and confirm that "pitwall.pass.season" exists
   and that "pitwall.charter.season" does NOT. If it already exists, stop and tell me.
2. Click Create product (Create one-time product).
   - Product ID: pitwall.charter.season
     STOP before saving and show me the Product ID field. It can never be changed or reused.
     Wait for me to say "confirmed".
   - Name: Charter
   - Description: Pit Wall for every player in one league, for the season.
3. Pricing / purchase option: one purchase option, "Buy", not a rental and not a subscription.
   Set the default price to USD 39.99 and let Play convert local prices. Do not hand-edit any
   country. If Play asks for a purchase option ID, use: buy
   If Play asks whether the product is consumable or multi-quantity, leave quantity at 1. The
   app consumes it after validation, as it does for pitwall.pass.season. Open that product and
   copy its settings if you are unsure.
4. Save. Do NOT activate the product or its purchase option: leave it Inactive. Tell me its
   status.
5. Go to Settings (account level, the gear icon outside the app) → License testing, and list
   the Gmail addresses already there. Do not add or remove any; just report them.
6. Report back: the product's status (Active or Inactive), its price in USD, and a
   screenshot of the product page.

Never click anything that publishes a release, sends an app for review, or changes payments
profile or banking settings.
```

**Activation.** BUILD.md says the products stay inactive in production until the flag flip, so the prompt leaves the Play product **Inactive**. Play will not sell an inactive product, even to a license tester. So the slice 5 sandbox purchase on Play needs the product **activated** first. That is safe while the flag is off: the server charters only test purchases by `testAccount` users, and records anything else unapplied. It is still the owner's call, made when slice 5 testing starts.

### Then test it (once slice 4 puts the button in the app, and the product is activated)

1. Use a license-tester Google account whose Undercut account is marked `testAccount`.
2. Install from the **internal testing** track. Play only sells to an app it delivered, so a sideloaded APK cannot buy.
3. Charter a league you own. Expect, in order:
   - a `purchases` document with `charterApplied: true` and `charterTest: true`;
   - `leagues/{id}.chartered: true`;
   - each approved member's `charterAccess`.

---

## App Store Connect

### Prompt for Claude in Chrome

Paste this into Claude in Chrome with App Store Connect open and signed in:

```
You are setting up a new in-app purchase in App Store Connect for the app "Undercut"
(bundle id com.undercut.app, Apple ID 6759428075). Work only inside that app. Do not change
any other in-app purchase, price, version, or setting.

0. Business → Agreements, Tax, and Banking: report whether the Paid Applications agreement is
   Active. If it is not, stop and tell me. Do not accept, sign, or edit anything there.
1. Open the Undercut app → Monetization → In-App Purchases. List the existing product IDs.
   Confirm "pitwall.pass.season" exists and is a Non-Renewing Subscription, and that
   "pitwall.charter.season" does NOT exist. If it exists, stop and tell me.
2. Click + to create a new in-app purchase.
   - Type: Non-Renewing Subscription (the same type as pitwall.pass.season)
   - Reference Name: Charter
   - Product ID: pitwall.charter.season
     STOP before clicking Create and show me both fields. The Product ID can never be changed
     or reused. Wait for me to say "confirmed".
3. Availability: all countries and regions where the app is available (match
   pitwall.pass.season).
4. Price Schedule: base country United States, price USD 39.99. Let Apple set the other
   countries automatically. Do not hand-edit any country.
5. App Store Localization → add English (U.S.):
   - Display Name: Charter
   - Description: Pit Wall for every player in one league, for the season.
6. Review Information:
   - Leave the screenshot empty for now. The screen that sells Charter is not in the app yet.
   - Review Notes: "Charter is bought by a league's owner from that league's page. It
     unlocks the Pit Wall analytics portal for every approved member of that one league
     until 31 January after the season. Test account details are in the app's review
     information."
7. Save. The status will read "Missing Metadata" (no screenshot) or "Ready to Submit".
   Do NOT add this in-app purchase to any app version, and do NOT submit anything for review.
   It is submitted later, with the build that contains the Charter screen.
8. Users and Access → Sandbox → Test Accounts: list the existing sandbox testers (emails
   only). Do not create or delete any.
9. Report back: the IAP status, the US price, the display name, and a screenshot of the
   in-app purchase page.

Never click Submit for Review, Add for Review, Remove from Sale, or anything under Agreements,
Tax, and Banking or Payments and Financial Reports.
```

### Then test it (once slice 4 puts the button in the app)

- Sandbox purchases work before Apple has reviewed the product. Sign in on the device with a sandbox tester whose Undercut account is marked `testAccount`, then charter a league you own.
- The purchase record stores `environment: Sandbox` and `charterTest: true`.
- **Submit the IAP for review with the first build that shows the Charter offer.** Apple reviews a first in-app purchase together with an app version. A build without the screen would be rejected for an IAP the reviewer cannot find.

---

## App Store refund notifications (slice 5, before the flip)

The daily refund sweep cannot re-check a StoreKit 2 purchase, so without this a refunded App Store pass or charter stays live until the season ends. Apple pushes the refund to `pw-appStoreNotifications` instead. That function verifies the notification against Apple's certificate chain, so it needs no secret. It then takes back what the purchase paid for: the pass, the charter or the slots.

**1. Deploy the function first**, with the rest of slice 5 (`aidlc op new functions-deploy -p only=functions:pw-appStoreNotifications,functions:pw-stripeWebhook,functions:pw-sweepRefundedPasses,functions:validatePurchase`). Once it is deployed, check that it answers:

```
curl -s -o /dev/null -w '%{http_code}\n' https://us-central1-f1-app-18077.cloudfunctions.net/pw-appStoreNotifications              # 405
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' https://us-central1-f1-app-18077.cloudfunctions.net/pw-appStoreNotifications   # 400
```

**2. Set the URL in App Store Connect.** Paste this into Claude in Chrome:

```
In App Store Connect, app "Undercut" (com.undercut.app, Apple ID 6759428075) only.
Go to the app → General → App Information → App Store Server Notifications.
1. Report what is there now for Production Server URL and Sandbox Server URL, and the version
   (Version 1 or Version 2). If either URL is already set to something, STOP and tell me.
2. Set both Production Server URL and Sandbox Server URL to:
   https://us-central1-f1-app-18077.cloudfunctions.net/pw-appStoreNotifications
   and choose Version 2 notifications for both. STOP before saving and show me, and wait
   for me to say "confirmed".
3. Save and report the result.
Do not change anything else on the page or in the app.
```

**3. Prove it.** Apple sends a `TEST` notification when asked through the App Store Server API, which needs an In-App Purchase key this project does not hold. Without one, the proof is a sandbox refund on the slice 5 test charter. Then check:

- `firebase functions:log --only pw-appStoreNotifications` shows `[apple] REFUND pitwall.charter.season … uncharted`;
- the purchase has `status: refunded`;
- the league is no longer chartered.

A `rejected` line in the log means the notification did not verify. Fix that before the flip.

What it does with each notification:

| Type | Action |
|---|---|
| `REFUND`, `REVOKE` | Takes back what that purchase paid for. A pass is taken only if that purchase granted it. |
| `REFUND_REVERSED` | Nothing automatic. It is logged as an error. A pass is re-granted with `pitwallPass.js grant`. A charter cannot be re-applied from its purchase: a refunded purchase never charters again, by design, so that a replay can never undo a refund. Re-granting a reversed charter needs a hand-written support grant, decided case by case. |
| A refund for a purchase the app never validated | Writes a refunded record under that purchase's id, so a later replay of the receipt is refused. |
| Anything else | Answered 200 and ignored. |

## Support: a paid charter that did not apply

A purchase is recorded unapplied (`charterApplied: false`, or a `charter_grants` refusal) in these cases:

- the buyer was not the owner;
- the league was already chartered;
- the league was too large;
- the sale was off.

To find them:

```
aidlc op new uc-charter-support -t "list unapplied charters" -p action=list -p ref=- -p league=-
```

Then do one of:

- **Apply it** (the buyer owns the league): `-p action=apply -p ref=<purchase id or stripe:pi_…> -p league=-`. The league recorded on the purchase is used; pass `league=<id>` only when none was recorded. The sale flag is not checked, because the buyer has paid. The usual checks still apply: owner only, one charter per season, never after a refund. The grant is marked `support: true`, so the sale flip keeps it.
- **Refund it**. Refund in the store console (Play Console → Order management; for Apple, the buyer asks at reportaproblem.apple.com, so send them there; the Stripe dashboard for web). The sweep, the App Store notification or the Stripe webhook records it. If the charter was applied and the refund cannot reach those paths, take it back with `-p action=clear -p ref=<id> -p league=<id>`.

Each op's dry run lists every document it can write. The backup takes exactly that list, and the apply refuses to write anything outside it.

## The sale flip

```
aidlc op new uc-charter-sale -t "Charter on sale" -p state=on
```

Before the first launch, the only ways to charter are a test purchase and a support apply. So the first flip clears every live charter that is not a support apply, then sets `config/app.charter.enabled: true`. Once the sale is on, `state=on` clears nothing. `state=off` only turns the flag off and keeps live charters.

**Before running it**, check all of these:

- `minVersion` is the first build carrying slices 3 and 4 (the dry run prints it);
- the App Store notification URL is proven;
- the sandbox purchases on Play and Apple, and the Stripe test payment and refund, are done;
- the Play product is active;
- the trademark search is done;
- the privacy read and the store data-safety check for the slice 3 emails are done;
- `PITWALL_CONTENT_OPEN` is false in the build that is live.

The first `state=on` records `launchedAt`. After that, a pause (`state=off`) and a resume (`state=on`) never clear anything, because live charters may be paid ones.

## Stripe test payment and refund (slice 5)

`createCheckout` sells a charter while the flag is off only on a **test** key (`sk_test_…`). The live functions hold the live key, so this test means swapping **both** Stripe secrets to their test values and back afterwards: `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The second comes from a test-mode webhook endpoint pointing at `pw-stripeWebhook`. Redeploy `pw-createCheckout` and `pw-stripeWebhook` through `aidlc op` after each swap, because a secret is bound at deploy.

While the test key is in, web checkout takes no real money, and the personal pass is not on sale anyway while `PITWALL_CONTENT_OPEN` is true. The swap is still an owner decision.

1. Pay with card `4242 4242 4242 4242`.
2. Expect `charter_grants/stripe:{payment_intent}` with `grantedAt`, and the league chartered.
3. Refund the payment in full from the Stripe dashboard.
4. Expect `clearedAt` on the same record, the league no longer chartered, and members' `charterAccess` emptied.
5. Optional: a second checkout with the dispute card `4000 0000 0000 0259`. Expect the same clear, found through `charter_grants` by the PaymentIntent.

A partial refund keeps the charter. A dispute on a **personal pass** payment now revokes that pass. The webhook asks Stripe for the payment's Checkout Session. It takes the pass only if the live pass is a Stripe pass for the same season.

## Not part of this setup

- **Amazon:** no item. The Amazon build hides Charter and honours access bought elsewhere.
- **Stripe:** no product or price object to create. Check that the live webhook endpoint subscribes to these events (the pass already uses the first three):
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `charge.refunded`
  - `charge.dispute.created`

---

## Slot packs (owner decision 2026-11-25)

Two more products, both **+3 member slots**. They are consumable, bought again and again, and the server applies each one to the league named on the purchase.

| Product ID | Price | Where | Description |
|---|---|---|---|
| `league.slots3` | **$4.99** | Play, App Store, **Amazon** | `Add 3 more member slots to your league` |
| `league.slots3.charter` | **$3.99** | Play, App Store (not Amazon) | `Add 3 more member slots to your chartered league` |

The app shows the "LEAGUE SIZE +3" row only once the store returns a price for the product, so creating the products is what turns the row on. Unlike Charter, there is no server flag. **Activating these products puts them on sale in the next build that carries this code.** Builds already in the stores never show the row.

Apple type: **Consumable**. Play: one-time product, consumed after validation. Amazon: Consumable.

### Prompt for Claude in Chrome (Play Console)

```
In Google Play Console, app "Undercut" (com.undercut.app) only. Do not change any other product.
Create two one-time products, one at a time. For each, STOP before saving and show me the
Product ID field, and wait for me to say "confirmed" (IDs can never be changed or reused).
  1. Product ID: league.slots3          Name: League Slots   Description: Add 3 more member slots to your league            Price: USD 4.99
  2. Product ID: league.slots3.charter  Name: League Slots   Description: Add 3 more member slots to your chartered league  Price: USD 3.99
One purchase option "buy", quantity 1, consumed after purchase (same settings as avatar.pack;
open it and copy them if unsure). Let Play convert local prices. Leave both Inactive and tell me
their status; I will activate them when the build that sells them is ready.
Do not touch league.expansion. Never publish a release or change payments settings.
```

### Prompt for Claude in Chrome (App Store Connect)

```
In App Store Connect, app "Undercut" (com.undercut.app, Apple ID 6759428075) only. Do not change
any other in-app purchase. Create two in-app purchases of type Consumable, one at a time. For
each, STOP before clicking Create and show me the Product ID, and wait for me to say "confirmed".
  1. Reference Name: League Slots 4.99   Product ID: league.slots3
     Price: USD 4.99   Display Name: League Slots   Description: Add 3 more member slots to your league
  2. Reference Name: League Slots 3.99   Product ID: league.slots3.charter
     Price: USD 3.99   Display Name: League Slots   Description: Add 3 more member slots to your chartered league
Availability: match avatar.pack. Review notes: "Bought by a league's owner from the league
page; adds 3 member slots to that league." Leave the screenshot empty. Do NOT add them to any
app version and do NOT submit anything for review. Report each one's status and price.
```

### Amazon (by hand)

Amazon Developer Console → Undercut → In-App Items → **Add a Consumable**:
- SKU: `league.slots3`
- Title: `League Slots`
- Price: $4.99

Submit it with the app version that sells it. There is no `league.slots3.charter` on Amazon.
