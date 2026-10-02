# Undercut 2.4.1 — release notes

Android versionCode 66 · Amazon versionCode 66 · iOS build 48

versionCode 65 went to Play internal testing as 2.4.0 while the config still read 64, so 2.4.1
starts at 66: Play refuses a code it has already seen, released or not.

## Google Play (500 characters)

Your account is yours, not the store's. Sign in with Google, Apple or Amazon from any version of
Undercut — so the team you built on a tablet is the team you find on your phone.

Picking your first team is clearer too: the button now says which pick is still missing instead of
counting drivers and constructors together.

## Apple App Store

**What's New in This Version**

An Undercut account belongs to you, not to the store you installed from.

Sign in with Apple, Google or Amazon from any version of the app. Build a team on one device, find
the same team — and the same leagues, and the same Pit Wall Pass — on the next one.

Picking a first team is clearer: the save button names the pick you are still missing rather than
counting drivers and constructors together, so a missing constructor no longer reads as one more
driver.

## Amazon Appstore

Your account is yours, not the store's. Sign in with Amazon, Apple or Google from any version of
Undercut, and the team you built on your tablet is the team you find on your phone.

This version also launches properly on Fire tablets, and the team picker now names the pick you are
still missing.

## What actually changed

- **Cross-store sign-in** (F-091). Each build now offers every provider it can run, its own store
  first: Amazon and Apple on the Amazon build, Google, Apple and Amazon on Play, Apple, Google and
  Amazon on iOS. Before this, an account created with Apple on an iPhone was simply unreachable
  from the Play build — the person was shown a Google button instead and ended up with a second
  empty account, Pit Wall Pass and all left behind on the first one.
- **Sign in with Apple away from iOS** (F-091). `expo-apple-authentication` is iOS-only, so
  everywhere else this runs Apple's web flow. The identity token never travels on the app's custom
  scheme: it is filed server-side under the hash of a verifier the device keeps, and traded for over
  HTTPS. On Android any installed app may claim a custom scheme, and an Apple identity token is
  enough to sign in as its owner.
- **Login with Amazon, hardened** (F-091). The old flow handed Amazon's authorization code back to
  the app on that same claimable scheme, and the server would exchange that code for a session for
  whoever presented it. The code now stays on the server. This is what makes the button safe to
  offer outside the Amazon build, and it is why that build is the only one that showed it before.
- **The Amazon build launches** (F-090). R8 was renaming Amazon's in-app purchasing SDK, whose
  framework looks its own classes up by name, so 2.4.0 force-closed before a line of JavaScript ran
  and Amazon rejected it. The keep rules are now in place and scoped to that build, and the build
  script asserts they are there.
- **The save button names the missing pick.** It used to add missing drivers and a missing
  constructor into one number, so five drivers and no constructor read as `PICK 1 MORE` — one more
  of the only thing on screen, which was the one pick you could not make from there.

## Store submission checklist

1. **Before shipping the Apple pill on Android:** the Apple Services ID must exist, its domain must
   be verified, and the Services ID must be in the Firebase Apple provider. Steps in
   `.aidlc/specs/F-091.md`. Without `EXPO_PUBLIC_APPLE_SERVICES_ID` in the build the pill is hidden,
   so shipping before this is done is safe — it just does not appear.
2. **Before shipping the Amazon pill outside the Amazon build:**
   `https://f1-app-18077.web.app/undercut/auth/amazon` must be an allowed return URL in the Login
   with Amazon security profile, and `EXPO_PUBLIC_AMAZON_REDIRECT_URI` must be set in the build.
   Without it the pill stays on the Amazon build and the old flow runs there, as today.
3. Deploy in order: **functions** (`appleAuthRedirect`, `claimAppleSignIn`, `amazonAuthRedirect`,
   `claimAmazonSignIn`, `cleanupAuthHandoffs`), then **hosting** (the two rewrites), then **rules**
   (`auth_handoff` denial), then the builds. A build whose sign-in endpoints are not deployed yet
   cannot sign anyone in through them.
4. Amazon takes an APK built with `EXPO_PUBLIC_STORE=amazon`; it is a different artifact from the
   Play bundle. Unchanged from 2.4.0.
