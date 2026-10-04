# Briefing redesign handoff (2026-10-04)

`HANDOFF.md` is the designer's note as delivered: tokens, type, page structure and the calls-strip interaction spec. The design files themselves (`Main.dc.html`, `Light.dc.html`, `canvas.json`) are **not committed**; they are on the share at `Z:\f1-app\web` (`/mnt/smb/f1-app/web` on the build box). They are design-tool components (`<x-dc>`, `{{hole}}`, `<sc-for>`, `<sc-if>`) and need a `support.js` runtime that was not included.

`render-dc.js` stands in for that runtime well enough to look at them: it evaluates the component's `renderVals()` and expands the template into plain HTML.

```
node render-dc.js Main.dc.html dark.html '{"pinned":0}'
node render-dc.js Main.dc.html dark-expanded.html '{"pinned":0,"expanded":true}'
node render-dc.js Light.dc.html light.html '{"pinned":0}'
```

Open the output in a browser. Event handlers are stripped, so the peek/lock/expand states are reached through the state argument, not by clicking.

## What the implementation (F-097) changed from the handoff
- The hero is Briefing-only. The top bar, round strip and section nav stay in the sticky shell every page shares, so the lock countdown and the nav are always on screen and the other seven pages keep their scroll budget.
- On a phone the wire shows five headlines (the rest are on the Wire page) and the comparison opens as a slide-over rather than a floating callout. The handoff's layout measured 4.6 screens at 390px; the portal's limit is 3.
- Archivo wide and the revised tokens are applied to the whole portal, not just the Briefing, so one page does not sit in a different typeface from the other seven. `docs/design/grid/TRANSITION.md` remains the app's spec; the portal's values are in `web/pitwall/src/styles.css`.
- Frames the handoff did not draw but the spec requires stay: rivals' likely moves, weather, the free top ten, swap calls when the lineup is open, the locked state for readers without a pass, the example-data label, and the confidence lean on each call (F-096).
- Nothing is locked at rest. The handoff opens with the first call locked and its callout over the wire; here the page opens readable, hover peeks, click locks.
- The lineup tiles are desktop-only on the Briefing (the Lab is one tap away on a phone), and the tiles show projected points and the predicted price move, which the portal has, rather than the app's season points and trend. The handoff's SHARE link has nothing behind it yet (F-065) and is not drawn; EDIT goes to the Lineup Lab.
- Column balance: the weather sits under the wire and rivals, the top ten under the lineup and movers, so the two columns end within 40px of each other and the expanded comparison stays inside the budget (2.92 screens at 1440×900).
- The handoff labels Audi's colour as Sauber; the portal takes team colours from the payload.

Screenshots of the result are in `verify/` (dark and light at 1440×900, phone at 390×844, and the expanded comparison).
