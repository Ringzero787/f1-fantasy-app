# Setting up the Pit Wall Pass in the three stores

The product id is the same everywhere and must match exactly, because the server keys the grant on it:

```
pitwall.pass.season
```

Price is **$14.99**, one season. It is bought again each season, so it is a repeatable product in every store, never a non-consumable and never an auto-renewing subscription.

Nothing in the app offers a purchase until the `pitwall` block in `config/app` sets `mode` to `iap` for that platform. Until then the app links to the portal and the pass is bought on the web through Stripe. Both routes end at the same entitlement.

---

## Google Play

**Create the product**

1. Play Console → the Undercut app → **Monetize with Play** → **Products** → **In-app products** → **Create product**.
2. Product ID: `pitwall.pass.season`. This cannot be changed or reused later, so check it before saving.
3. Name: `Pit Wall Pass`. Description: the season of projections, recommendations and League Pro.
4. Price: set the default to **$14.99** and review the converted local prices.
5. **Activate** the product. A product left inactive returns "item unavailable" at purchase.

**Let the server verify purchases** — the step most often missed

The verification function authenticates as the functions runtime account, not a key we ship. That account must be able to read orders:

```
95743527146-compute@developer.gserviceaccount.com
```

1. Play Console → **Setup** → **API access**.
2. Link the Google Cloud project if it is not already linked.
3. Find that service account and grant it, for the Undercut app: **View financial data, orders, and cancellation survey responses** and **Manage orders and subscriptions**.
4. Permission changes take a few minutes to apply.

**Test it**

1. Play Console → account level **Settings** → **License testing** → add the Google accounts that should buy without being charged.
2. Install the build from an **internal testing** track. A purchase cannot be tested from a locally installed file: Play only sells to an app it delivered.
3. Buy the pass. Expect a `purchases` document, then the pass on the account within a second or two.

---

## App Store

**Create the product**

1. App Store Connect → the Undercut app → **Monetization** → **In-App Purchases** → **+**.
2. Type: **Non-Renewing Subscription**. That is Apple's type for a season pass: it can be bought again next season, unlike a non-consumable.
3. Reference Name: `Pit Wall Pass`. Product ID: `pitwall.pass.season`.
4. Price: **$14.99**.
5. Add the localisation: display name and description shown on the payment sheet.
6. **Review information**: a screenshot of where the pass is offered, and a note saying it unlocks the Pit Wall portal for one season.
7. Submit it **with the 2.4.0 build**. Apple reviews the first purchase alongside an app version; it stays "Waiting for Review" until a version carries it.

**Agreements**

**Business** → **Agreements, Tax, and Banking**: the Paid Applications agreement must be active, with banking and tax complete. Nothing sells until it is.

No App Store Server API key is needed. The app sends a StoreKit 2 signed transaction and the server checks its certificate chain against Apple's root, so there is no key to create, store or rotate.

**Test it**

1. App Store Connect → **Users and Access** → **Sandbox** → **Test Accounts** → create one. Use an email address you control that is not an Apple ID.
2. On the device: Settings → App Store → sign out of the sandbox account if one is set, then install the build and buy. iOS asks for the sandbox account at purchase.
3. A sandbox purchase is properly signed and is not a sale. Both are accepted so review and testing work, and the purchase record stores `environment: Sandbox`, so a pass granted from a test can be found and revoked.

---

## Amazon Appstore

**Create the product**

1. Amazon Developer Console → the Undercut app → **In-App Items** → **Add a Consumable**.
2. SKU: `pitwall.pass.season`. Title and description as above, price **$14.99**.
3. Submit it with the app version. Amazon reviews items with the build.

**The shared secret**

Amazon's verification service needs the shared secret for the developer account:

1. Amazon Developer Console → **Settings** → **Shared Secret**.
2. Put it in the function config and redeploy the functions through an operation:

```
firebase functions:config:set amazon.shared_secret="<the secret>" --project f1-app-18077
```

It goes in the function config rather than Secret Manager on purpose. Firebase resolves every declared secret before it filters a deploy by target, so a declared secret with no value blocks **every** functions deploy on the project, which has already cost us once.

**Test it**

Amazon purchases are tested with the **App Tester** app plus a JSON file of your items on the device. Live verification only works once the item is published.

---

## What good looks like

After a successful purchase, in order:

1. A document in `purchases` with `status: validated` and the platform.
2. `users/{uid}.pass` written with the season and expiry.
3. The `pw` claim stamped by the trigger, so the Firestore rules let the account read the paid documents.
4. Any league the buyer owns marked Pro.
5. In the app, the Profile row shows the expiry; on the portal, the locked frames open.

If step 1 happens and step 2 does not, the purchase verified but the grant failed: the function logs say which. The store transaction is only finished after the grant, so an unfinished purchase is replayed the next time the app opens rather than a paid pass being lost.
