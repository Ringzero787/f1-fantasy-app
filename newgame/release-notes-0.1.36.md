# Track Limits 0.1.36 (versionCode 37)

## Fixed

- **Call-sign prompt re-appearing on every launch.** The prompt gate read
  `displayName` from whatever user object was in the store at the time — on a
  device whose secure-storage snapshot is stale (or whose secure-store
  write-back fails silently), that was a placeholder name on every cold start,
  even though the account's real name was saved server-side long ago. The gate
  now only evaluates the profile freshly loaded from Firestore this session,
  and fires at most once per session. Verified on emulator: real-name account
  never prompts across cold relaunches; a genuine placeholder account still
  prompts once, and never again after saving.
- Auth listener no longer dies on a transient Firestore read failure at cold
  start (previously an unhandled rejection that skipped the profile refresh).
- Profile footer version was hardcoded "v0.1.19"; now reads the real app
  version from expo config.

## Notes

- Renames after the first prompt live in Profile → Edit name (unchanged).
