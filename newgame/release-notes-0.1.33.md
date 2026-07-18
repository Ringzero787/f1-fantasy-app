# Track Limits 0.1.33

**versionCode:** 34
**versionName:** 0.1.33

## Store fixed (helmets / cosmetics)

The economy-security lockdown set `tl_entitlements` to `write: false`, which
silently broke the whole mock-purchase store flow AND equipping helmets —
both wrote entitlements client-side. Now server-authoritative like the rest
of the economy:

- New callables `tlMockPurchase` (validates product, applies via the shared
  `applyEntitlement`, logs a `tl_purchases` record with `source:'mock'`) and
  `tlSelectCosmetic` (pack-ownership check, equips). **Requires functions
  deploy alongside this app release.**
- `MOCK_PURCHASES_ENABLED` flag in `functions/src/purchases/mockPurchase.ts`
  must be flipped to false when real IAP goes live, or the callable bypasses
  billing.
- Client `getEntitlements` is now read-only (defaults resolved locally; the
  server creates the doc on first purchase/equip). Dead client-side
  `applyEntitlement` removed.

## Player rename

There was no UI to change your display name. Profile now has "Edit name"
(inline editor, 2–24 chars) → `authService.updateDisplayNameEverywhere`,
which updates `tl_users` plus your member doc in every TL league so
leaderboards match. NOTE: the `members` collection-group query spans both
apps' leagues in the shared Firestore — the helper filters to `tl_leagues`
parents so Undercut league names are untouched.

## Play "What's new"

Store purchases and helmet changes work again. You can now edit your player
name from the Profile tab.
