# Permission request to OpenF1 (draft)

Status: **draft, not sent.** Owner sends it. Tracked in `.aidlc/decisions/ADR-001-pit-wall-pass-and-timing-data.md`; append the reply there.

How to send: openf1.org has a **contact** link in its navigation and FAQ (checked 2026-09-19). Their site says the API is "intended for educational purposes, personal learning projects, research, and non-commercial fan engagement" and "For other use cases, please contact us to discuss appropriate licensing." They also list a Sponsor tier at EUR 9.90 per month (live data, higher rate limits).

Before sending, fill in the two placeholders in square brackets.

---

**Subject:** Licensing question: OpenF1 data in a fantasy game with a paid tier

Hi,

I run Human NPC Studio, a one-person studio. Our app Undercut is a free motorsport fantasy game on Google Play, the App Store and the Amazon Appstore. It is unofficial and small (about 60 players today). We have used OpenF1 since launch to fetch sessions, classifications and laps so we can score each race, and I want to thank you for the project; the game would not exist without it.

I am writing because we plan to add a paid option, and I want to be sure we use your data within your terms.

**What we plan**

- In February 2027 we will launch a web companion, Undercut Pit Wall, with a free tier and one paid pass (USD 14.99 per season).
- The paid features are built only from our own game data (player prices, ownership, lineups, our fantasy scores) and from race classifications.
- Anything derived from OpenF1 timing data (long-run pace from practice laps, stint and tyre degradation, pit stop times, weather and race control summaries) would be shown **only in the free tier**, to every signed-in user, and never placed behind the pass. Our code keeps the two apart and tests enforce it.
- We show derived aggregates only. We do not redistribute raw data, mirror live timing, or expose your API. We fetch once per session server-side, cache the result, and stay well inside the rate limits (one daily job plus one job after each session).
- The site credits OpenF1 by name with a link, and carries the usual notice that we are not affiliated with any racing series, team or governing body.

**What I would like to know**

1. Is the use above acceptable: OpenF1-derived frames free to all users, inside a product that also sells a pass built on other data?
2. The free game itself will continue to use OpenF1 classifications for scoring once the pass exists. Is that acceptable, or does selling anything in the same product change your view?
3. If either needs a licence or a paid plan, what would that look like? I am glad to become a Sponsor regardless, and would rather pay for a clear arrangement than rely on an assumption.
4. Is there an attribution wording you prefer?

If any part of this is not something you can allow, please say so and we will remove the OpenF1-derived frames; they sit behind a switch for exactly that reason.

Thank you for your time, and for building OpenF1.

[Your name]
Human NPC Studio
[Your email]
Undercut: https://undercut.humannpc.com

---

## Notes for the owner

- Question 2 matters as much as question 1. Today's free app already depends on OpenF1 for scoring; once anything is sold, a strict reading could cover that too. If the answer is no, the fallback for scoring is another results source (race classifications are published facts and available from several places), which is a contained change in `functions/src/ingestion/`.
- Becoming a Sponsor now (EUR 9.90 per month) is cheap goodwill and gives live data and higher limits, but it is a sponsorship, not a commercial licence. Do not treat it as permission.
- Keep the reply. Paste it, with the date, under a "Provider reply" heading in ADR-001.
- If there is no reply within about three weeks, follow up once, then decide before the first beta build whether the timing frames stay on (`config/app.pitwall.timingFrames`).
