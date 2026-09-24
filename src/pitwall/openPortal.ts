/**
 * Opening Pit Wall from the app (F-077).
 *
 * The portal is a website signed in with the same Undercut account. Rather than asking someone to
 * type their password again in a browser — and rather than passing a long-lived token around — the
 * app asks the server for a single-use handoff code and opens the portal at `/h#<code>`. The code
 * is in the fragment, so it never reaches a server log, it is good for sixty seconds, and the
 * portal asks the person to confirm before it replaces any session already there.
 *
 * Amazon sign-in cannot be done in a browser popup at all, so for those users this is the only way
 * in. Everyone else can also sign in on the site directly.
 *
 * Pure: the call that mints a code lives in `client.ts`.
 */
export const PORTAL_URL = 'https://pitwall.humannpc.com';

/**
 * The address to open. The code belongs in the fragment, which browsers never send to a server;
 * `src` rides behind it so the portal can tell where the person came from.
 */
export const handoffUrl = (code: string, src = 'profile', base = PORTAL_URL): string => `${base.replace(/\/+$/, '')}/h#${code}&src=${src}`;
