# Undercut 2.4.0 — release notes

versionCode 60 · iOS build 43

## Google Play (500 characters)

Pit Wall arrives. Open it from your profile and you land straight in, already signed in with your Undercut account: projections for the whole grid, the swaps the data backs, and the reasons behind them.

With a Pit Wall Pass, picking a driver gets easier. Every option in the picker shows its projection for the coming round, the pick the model would take is marked, and the best value is marked too. Sort by projection alongside points and price.

Also in this release: faster start-up, and fixes across the team and league screens.

## Apple App Store

**What's New in This Version**

Pit Wall arrives.

Open it from your profile and you land in already signed in with your Undercut account. Projections for every driver and constructor, the swaps the data backs, and the reasoning behind each one.

A Pit Wall Pass also changes how you pick. In the team picker, every option shows its projection for the coming round. The pick the model would take is marked, and so is the best value when that is a different driver. Projection joins points and price as a way to sort.

The pass runs for the season and includes League Pro for every league you own.

Fixes and improvements across the team and league screens.

## Amazon Appstore

Pit Wall arrives. Open it from your profile and you land straight in with your Undercut account: projections for the whole grid, the swaps the data backs, and the reasons behind them.

With a Pit Wall Pass, the team picker shows each option's projection for the coming round, marks the pick the model would take, and marks the best value. Sort by projection alongside points and price.

Faster start-up, plus fixes across the team and league screens.

## Promotional text (Apple, 170 characters)

Projections for the whole grid, the swaps the data backs, and the reasoning behind each one. Pit Wall is now a tap away from your profile.

## What actually changed

- **Pit Wall in the app** (F-077). A row in Profile mints a single-use code and opens the portal already signed in, which is the only route for people who sign in with Amazon. It shows the pass expiry, and refreshes the entitlement when the browser closes. Placement and copy are server-driven, so the surface can be limited or switched off without a build.
- **Pass-only marks in the picker** (F-077). Projection per row, a Pit Wall pick, a best-value mark, and projection as a third sort. The marks rank only rows the picker already allows, so one can never suggest a move the budget or a lockout forbids.
- **In-app purchase works again** (F-060). Every purchase had silently done nothing since 2.1.0. The library is back, and the Pit Wall Pass can be sold through the stores once the products are live. Nothing in the app mentions a purchase until the server-side config enables it for that platform.

## Store submission checklist

1. The `pitwall.pass.season` product exists and is **active** in the console. See `docs/store/pitwall-pass-setup.md`.
2. Play only: the functions runtime account can read orders.
3. Amazon only: `amazon.shared_secret` is set in the function config and the functions are deployed.
4. The `pitwall` block is written to `config/app` with `minAppVersion: "2.4.0"`, otherwise the Profile row stays hidden on every build.
