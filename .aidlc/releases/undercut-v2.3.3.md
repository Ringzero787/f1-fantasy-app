# uc-v2.3.3 — 2026-09-19

Undercut 2.3.3 adds the new U-mark icon with its launch reveal and fixes the Team grid at some screen widths. It is the first Grid build intended for the stores; 2.3.0 to 2.3.2 were never submitted.

## Added

- New app icon: a white U with a red cut on the app's near-black ground, on the launcher, splash and store listings (F-067)
- Launch reveal: on a cold start the splash's U unrolls into the UNDERCUT wordmark and fades into the app, in under two seconds; reduced motion gets a still wordmark

## Fixed

- The six Team tiles no longer wrap into a single column at fractional screen widths

## Internal

- Store-screenshot showcase data for demo mode, enabled only by two build flags that the store build scripts refuse
- F-059 step B (scoped team reads, owner-only member count, `maxMembers` lock) is still not in force
