# Decisions

One file per decision. A decision is not edited after it is accepted, except to add an "amended by" or "superseded by" line; a change of mind is a new file.

| ADR | Decision | Date | Status |
|---|---|---|---|
| [ADR-000](ADR-000-adopt-aidlc.md) | This project runs the AIDLC gates on every PR and release | 2026-09-11 | accepted |
| [ADR-001](ADR-001-pit-wall-pass-and-timing-data.md) | One premium product (Pit Wall Pass, per season); what the timing data may be used for | 2026-09-19 | accepted, with later notes appended |
| [ADR-002](ADR-002-pit-wall-infrastructure.md) | Pit Wall: Cloudflare for the site, the build box for compute, GCP as backup | 2026-09-19 | accepted; decision 3 (the GCP backup runner) was never built |
| [ADR-003](ADR-003-model-gates-on-the-subscription.md) | The model gates run on the maintainer's machine, not on an API key in CI | 2026-09-28 | accepted |

## Reading ADR-001

ADR-001 has had notes appended since it was accepted, so the current position is at the end, not the top: the provider granted commercial use on a paid feed (2026-09-28), and live timing was switched on by owner decision on 2026-11-02. The provider's reply is paraphrased there and is not on file verbatim.

## Decided, not yet written down as an ADR

These were decided by the owner and are recorded only in specs, the roadmap or commit messages. Each deserves its own file.

- **Track Limits has its own repository** (2026-10-02), and this one keeps the Firestore rules, indexes and Hosting for both apps.
- **Go to market** (2026-10-14): closed beta through 2026, Pit Wall content free until the stores have 50 or more ratings, public launch at the 2027 pre-season. The roadmap also says "paid by 2027-02"; the two do not agree and the owner has not said which governs.
- **The season model** (2026-11-15): teams start fresh each season on the same document, leagues are kept with standings reset, the previous season is archived, opening prices come from the previous season's points at $6 a point for drivers.
- **Store builds are local, never a hosted build service.**
- **The language set**: nine languages, listed with the reasoning in `.aidlc/aidlc.yaml` under `localization`.
