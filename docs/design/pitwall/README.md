# Pit Wall

The web analytics portal for Undercut, and the worker that feeds it.

- **Portal:** `web/pitwall/`, on Cloudflare Pages. Deployed with the `pitwall-pages-deploy` op.
- **Worker:** `workers/pitwall/`, a systemd service (`pitwall-worker`) on the build box. It publishes projections on a schedule around each session and once a day. Deployed with the `pitwall-worker-deploy` op.
- **In the app:** the Pit Wall block and the handoff into the portal, `src/pitwall/`.
- **Server side:** the `pw` function group in `functions/src/pitwall/` (portal handoff and the Pass).

## Documents

| Document | What it is |
|---|---|
| `ARCHITECTURE.md` | How the portal, the worker, the queue and the data fit together |
| `RESEARCH.md` | The market research behind the product |
| `backtest-2026-09-19.md`, `backtest-2026-09-24.md` | Projection model backtests |
| `briefing/` | The Briefing redesign handoff and its verification screenshots |
| `verify/` | Verification screenshots by feature |

The decisions are in `.aidlc/decisions/`: ADR-001 (one paid product; what the timing data may be used for) and ADR-002 (where it runs). The September 2026 planning documents, including the original handoff and the prototype, are in `docs/archive/2026-09-pitwall-planning/`.

For what is built, live or still open, read the registry (`.aidlc/features.yaml`, F-068 to F-075 and later Pit Wall entries), not this page.
