# Decisions

One file per decision. From here on, a decision is not edited after it is accepted, except to add an "amended by" or "superseded by" line; a change of mind is a new file. ADR-001 predates that rule and has dated notes appended to it.

| ADR | Decision | Date | Status |
|---|---|---|---|
| [ADR-000](ADR-000-adopt-aidlc.md) | This project runs the AIDLC gates on every PR and release | 2026-09-11 | accepted |
| [ADR-001](ADR-001-pit-wall-pass-and-timing-data.md) | One premium product (Pit Wall Pass, per season); what the timing data may be used for | 2026-09-19 | accepted, with later notes appended |
| [ADR-002](ADR-002-pit-wall-infrastructure.md) | Pit Wall: Cloudflare for the site, the build box for compute, GCP as backup | 2026-09-19 | accepted; decision 3 (the GCP backup runner) was never built |
| [ADR-003](ADR-003-model-gates-on-the-subscription.md) | The model gates run on the maintainer's machine, not on an API key in CI | 2026-09-28 | accepted |
| [ADR-004](ADR-004-charter.md) | A second product: Charter, $39.99 per league per season, beside the personal pass | 2026-11-24 | accepted |

## Reading ADR-001

The numbered decisions at the top of ADR-001 still stand. What changed since is in the dated notes at the end, and has to be read in order: the provider granted commercial use on a paid feed (2026-09-28); a later note records that the provider's site labels that tier "personal use"; and live timing was switched on by owner decision on 2026-11-02 without the written confirmation the earlier notes had asked for. The basis is the 2026-09-28 reply, which is paraphrased there and not on file verbatim; the switch is one op back to off.

## Decided, not yet written down as an ADR

These were decided by the owner and are recorded in specs, the roadmap, `CLAUDE.md` or `aidlc.yaml`, not as decision files. Each deserves its own.

- **Track Limits has its own repository** (2026-10-02), and this one keeps the Firestore rules, indexes and Hosting for both apps.
- **Go to market** (2026-10-14): closed beta through 2026, Pit Wall content free until the stores have 50 or more ratings, public launch at the 2027 pre-season. The roadmap gives February 2027 as the target for the paid launch, "after ratings". What happens if the stores have fewer than 50 ratings in February is not decided.
- **The season model** (2026-11-15): teams start fresh each season on the same document, leagues are kept with standings reset, the previous season is archived, opening prices come from the previous season's points per race, at $6 a point for drivers and $3 for constructors.
- **Store builds are local, never a hosted build service.**
- **The language set**: nine languages, listed with the reasoning in `.aidlc/aidlc.yaml` under `localization`.
