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

## Stripe test payment and refund (slice 5)

Use a Stripe **test** secret key (`sk_test_…`) on the functions. With that key, `createCheckout` sells a charter while the flag is off. Run these steps:

1. Pay with card `4242 4242 4242 4242`.
2. Expect `charter_grants/stripe:{payment_intent}` with `grantedAt`, and the league chartered.
3. Refund the payment in full from the Stripe dashboard.
4. Expect `clearedAt` on the same record, the league no longer chartered, and members' `charterAccess` emptied.

A partial refund keeps the charter.

## Not part of this setup

- **Amazon:** no item. The Amazon build hides Charter and honours access bought elsewhere.
- **Stripe:** no product or price object to create. Check that the live webhook endpoint subscribes to these events (the pass already uses the first three):
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `charge.refunded`
  - `charge.dispute.created`
- **The sale switch:** turning on `config/app.charter.enabled` is the separate flag-flip op. It runs only after the pre-flip items in spec F-175 are done:
  - Apple StoreKit 2 refund notifications;
  - the support op for unapplied charters;
  - clearing test charters;
  - the trademark search.
