# Moonshot — design source

`SPEC.md` is the owner's design document for Moonshot as delivered on 2026-10-06 (sections 1–21 and 23–36; there was no §22 in the source), kept verbatim as the reference the features F-106 to F-109 implement. The document calls the product "Regal Leagues"; the features are registered under Undercut (`UC:`) in this repo pending the owner's word on the name.

Decisions taken while turning it into specs (`.aidlc/specs/F-106.md` to `F-109.md`):
- **Pricing is a server-side mode.** The document's reward bands are the `banded` mode and the default. A `continuous` mode (`(1 − p) / p × (1 − vig)`, rounded to 0.25, capped, band labels kept) is available because fixed multipliers across a 20-point probability band are exploitable at the band's top edge (a 64% podium at 1.25× has an expected value of +0.46 per stake; see F-106). The document's own §33 asks for simulation before launch; that simulation on the scored season picks the mode and the numbers.
- **Exact Finish is behind a flag**, off in V1 until the model's calibration gate (F-070) has passed, as §35 asks.
- **Terminology** from the summary section is the copy rule: Moonshot, Call, Prediction, Stake, Risk, Reward, Multiplier, Hit, Miss, Double Down; never bet, wager, odds, moneyline, parlay, sportsbook.
- **Final Moonshot / "Dark Side of the Moon"** (§31 config keys) is recorded as a follow-up, not specified.
