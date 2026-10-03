/**
 * Who is calling, for the sign-in rate limits (F-094).
 *
 * These functions run on Cloud Run behind the Firebase Hosting rewrite, and nothing here sets
 * Express's `trust proxy`, so `req.ip` is the socket peer — a Google frontend address, the same one
 * for every caller in the world. Keyed on that, `FILE_LIMIT` stops being ten sign-ins a minute per
 * person and becomes ten a minute **in total**, shared across Apple, Amazon and Google: eleven
 * requests from anywhere would lock everyone out of signing in.
 *
 * The left-most `x-forwarded-for` entry is the client the frontend saw. A caller can prepend
 * entries of their own, so this is not an identity — but a rate-limit key does not need to be one,
 * and a spoofable key is strictly better than a key everybody shares. Falls back to `req.ip` when
 * the header is absent, which is the direct-invocation case.
 */
export function callerIp(req: { headers?: Record<string, unknown>; ip?: string } | undefined): string | undefined {
  const raw = req?.headers?.['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header === 'string' && header.trim()) {
    const first = header.split(',')[0]?.trim();
    // Cap it: this becomes part of a hashed key, and the header is attacker-controlled.
    if (first) return first.slice(0, 64);
  }
  return req?.ip;
}
