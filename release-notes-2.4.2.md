# Undercut 2.4.2 — release notes

Android versionCode 67 · iOS build 49 (not built) · Amazon not rebuilt

**A renumber, not a change.** The code is identical to 2.4.1; only the version numbers moved. 2.4.1
went to Play production as versionCode 66 and the owner preferred a different number, so 2.4.2 /
vc67 supersedes it in the review queue — vc66 never reaches users.

## Store copy
Use the blocks in `release-notes-2.4.1.md`, unchanged. There are nine of them — Google Play, Apple
App Store and Amazon Appstore, each in English, Deutsch and Nederlands — and they describe this
build exactly, because it is the same build.

## What shipped elsewhere at 2.4.1, and stays shipped
- **Amazon**: `undercut-2.4.1-vc66-amazon.apk`, not rebuilt. The Amazon Appstore has no version-code
  collision with Play, so there is no reason to renumber it.
- **iOS**: build 48 uploaded to App Store Connect at 2.4.1. `buildNumber` here reads 49 because the
  bump script moves both numbers together; nothing has been built against it.

## What actually changed
Nothing. See `release-notes-2.4.1.md` for the substance: cross-store sign-in (F-091, F-093, F-094),
the save-button label, and the Amazon R8 launch fix (F-090).
