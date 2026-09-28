# ADR-003: the model gates run on the maintainer's subscription, not on an API key in CI

Date: 2026-09-28
Status: accepted (owner decision)

## Decision
CI runs the **deterministic** gates only — hygiene and typecheck, the test suites, the build matrix,
performance, accessibility, docs and localization parity. They block a merge, as before.

The four **model** gates — G02 spec, G05 security, G06 quality, G07 IP and trademark — no longer run
in GitHub Actions. They run before each merge on the maintainer's machine through Claude Code, using
the `aidlc:aidlc-spec`, `aidlc:aidlc-security`, `aidlc:aidlc-quality` and `aidlc:aidlc-ip` subagents,
which carry the same prompts CI used. Their findings are addressed on the branch exactly as before,
and the PR body records that the review ran.

`ANTHROPIC_API_KEY` is no longer passed to either workflow. The repository secret can stay where it
is; nothing reads it.

## Why
This is a one-person studio with a Claude Code subscription. Paying a second time, per token, for the
same models to review the same diffs bought nothing but a spending cap — and on 2026-09-27 that cap
stopped every merge in the repository for four days, which is a worse outcome than any finding those
gates have ever caught.

A GitHub runner cannot use a subscription: it has no logged-in session, and exporting credentials to
one would be both fragile and wrong. So the choice is not "API key or subscription in CI"; it is
"API key in CI, or the review happens where the developer already is". For a solo maintainer who
reads every finding anyway, the second is honest about what is actually happening.

## Consequences
- **A merge is only as reviewed as the person merging.** The model gates are now a step someone must
  run, not one the machine enforces. `CLAUDE.md` carries the rule; a PR merged without it is a
  process failure, not a build failure.
- Deterministic gates still stop a broken merge on their own: this is the half that catches
  regressions a reader would not.
- Gate findings and verdicts are no longer posted automatically to the PR. The reviewer summarises
  what ran and what was fixed in the PR body.
- Trademark screening (G07) already had no registry access — the USPTO and EUIPO keys were never
  set — so nothing is lost there that was not already missing.
- Reversible in one commit: put `ANTHROPIC_API_KEY` back in the two workflow `env` blocks.
- The same reasoning does **not** extend to product features that call a model unattended (the Pit
  Wall Outlook, F-071). A subscription is a developer tool with the developer's own rate limits, and
  a paid feature that generates content for customers on a schedule belongs on a metered key with a
  budget. That job keeps its API path and stays switched off until a key with a budget exists.
