/**
 * Paid Pit Wall content is free until the stores have 50+ ratings (F-124).
 *
 * Flip this to `false` together with restoring `allow read: if hasPass()` on `pw_pages`,
 * `pw_entities` and `pw_projections`, then rules-deploy + pitwall-pages-deploy.
 * Mirror: `web/pitwall/src/data/access.ts` (`PITWALL_CONTENT_OPEN`).
 */
export const PITWALL_CONTENT_OPEN = true;
