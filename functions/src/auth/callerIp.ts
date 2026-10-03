/**
 * Who is calling, for the sign-in rate limits (F-094).
 *
 * These functions run on Cloud Run behind the Firebase Hosting rewrite, and nothing here sets
 * Express's `trust proxy`, so `req.ip` is the socket peer — a Google frontend address, the same one
 * for every caller in the world. Keyed on that, `FILE_LIMIT` stops being ten sign-ins a minute per
 * person and becomes ten a minute **in total**, shared across Apple, Amazon and Google: eleven
 * requests from anywhere would lock everyone out of signing in.
 *
 * So the key comes from `x-forwarded-for` — but **not** its left-most entry. A caller writes their
 * own header and the frontend appends to it, so the left-most value is whatever the caller typed:
 * rotating it would hand out an unlimited number of fresh buckets, which is a worse failure than
 * the shared one it replaced. The entry before the last is the one our own frontend wrote about the
 * hop it accepted, and a caller cannot append after it.
 *
 * This is still best effort. It bounds a flood from one source; it is not an identity, and it does
 * not make these endpoints safe to point a botnet at. App Check is the answer to that, and is a
 * larger change than this one.
 */
export function callerIp(req: { headers?: Record<string, unknown>; ip?: string } | undefined): string | undefined {
  const raw = req?.headers?.['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header === 'string' && header.trim()) {
    const hops = header.split(',').map((h) => h.trim()).filter(Boolean);
    // Second from the right where there is a chain, the only entry where there is not.
    const chosen = hops.length >= 2 ? hops[hops.length - 2] : hops[0];
    // Capped: it becomes part of a hashed key, and part of this header is caller-written.
    if (chosen) return chosen.slice(0, 64);
  }
  return req?.ip;
}
