# Grid redesign — screenshot evidence

Expo-web renders (Playwright, headless Chromium, 396×856 @2x, demo mode) taken while building each feature. They back the pixel-level acceptance criteria in `.aidlc/specs/F-050.md`, `F-051.md` and `F-055.md`; CI only checks the derived state (helpers under `src/simple/grid/`).

| File | Feature | What it shows |
|---|---|---|
| `F-050-team-empty-dark.png` | F-050 | Team screen, six open slots, `LINEUP · 6 OPEN` |
| `F-050-team-lineup-dark.png` | F-050 | Team screen with a 3/5 lineup: numbers, ACE pills, colour bars, contract dots |
| `F-055-picker-drivers-dark.png` | F-055 | Pick Team, drivers tab, 5/5 picked, unaffordable rows dimmed |
| `F-055-save-summary-dark.png` | F-055 | Save summary sheet with contracts and bank after |
| `F-051-league-empty-dark.png` | F-051 | LEAGUE tab, "Racing solo." with Create / Join cards |
| `F-051-league-manager-dark.png` | F-051 | League Manager, manage step (invite code, EMAIL/SMS/COPY, LEAGUE SIZE) |
| `F-051-standings-dark.png` | F-051 | Standings with the viewer's row in red |
| `F-052-profile-dark.png` / `-light.png` | F-052 | Profile: identity, rows, pills, stat cards |
| `F-052-profile-history-light.png` | F-052 | Profile scrolled: RACE HISTORY expanded, PRIVACY POLICY |
| `F-053-login-dark.png` | F-053 | Sign-in: wordmark, social pills |
| `F-053-register-light.png` | F-053 | Create account: social pills + email fields |
| `F-053-create-team-dark.png` | F-053 | First run: Name your team |

Recipe: see the session notes — `npx expo start --web --clear` on a free port, then `PORT=<port> node shot*.js <outdir> dark|light`.
