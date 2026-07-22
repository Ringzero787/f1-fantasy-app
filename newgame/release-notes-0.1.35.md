# Track Limits 0.1.35

**versionCode:** 36
**AAB:** staged at gamer `Downloads\TrackLimits-0.1.35-vc36.aab`
**Supersedes 0.1.34/vc35** (built same day, never uploaded) — includes all of
its changes (call-sign prompt, rename fix, mock cash-bundle guard).

## Store redesign (full audit implementation)

- **My gear** section at the top: every owned helmet with preview, tap to
  equip — optimistic, ACTIVE ring moves instantly (was a 2-4s frozen wait
  through 4 sequential network hops; now background-settled with rollback).
- **Visual pack cards**: helmet preview thumbnails, OWNED/GET states.
- **PurchaseSheet** replaces the stacked-Alert buy flow: pack preview, item
  chips, in-button spinner, success flash, inline errors. No mock/SKU jargon.
- **Cosmetics-only until real IAP**: Cash/Garage/Pro tabs and Restore hidden
  behind USE_REAL_IAP (cash was blocked server-side already; the tabs read
  as broken while unbuyable).
- Shared HelmetPicker component (store + profile); profile equip now uses
  the same optimistic path.

## Play "What's new"

New store: see every helmet, buy in one tap, and equip instantly. Plus pick
your own call sign.
