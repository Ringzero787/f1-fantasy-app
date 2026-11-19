// F-163: which signed-up accounts are store testers and reviewers rather than players.
//
// A 2026-11-19 survey of production found 56 of 124 user documents with the same signature: a
// gmail address that is exactly the display name run together plus a dot and five digits
// ("Ana Lopez" → analopez.12345@gmail.com, 56 of 56; only 13 of the other 57 gmail users are even
// close), and 55 of them were never active after their first day. They arrive in bursts of two to five
// within minutes, mostly in October when a store build went out every few days. They run the
// real app (push tokens, the Moonshot tutorial), so they are test devices, not scripts. Google's
// test lab and Amazon's reviewers sign in with their own domains.
//
// The mark is written to `users/{uid}.testAccount` by functions/scripts/markTestAccounts.js only;
// the rules keep it server-owned. Readers (the admin page's counts) leave marked users out.

/** What the classifier needs from Firebase Auth. Millisecond times; 0 when unknown. */
export interface AccountFacts {
  email: string | null | undefined;
  displayName: string | null | undefined;
  createdMs: number;
  /** The later of last sign-in and last token refresh. */
  lastActiveMs: number;
}

export type TestAccountReason = 'test-lab' | 'store-reviewer' | 'tester-farm';

/** Anyone active this long after signing up played the game, whatever their address looks like. */
export const RETURNED_AFTER_MS = 24 * 3600 * 1000;

const TESTER_FARM_LOCAL = /^([a-z]+)\.\d{5}$/i;

/** Letters only, lower case: "Ana López-Ruiz" → "analpezruiz". */
const lettersOf = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z]/g, '');

/** Why this account is a test account, or null for a player (or anyone we are not sure about). */
export function testAccountReason(a: AccountFacts): TestAccountReason | null {
  if (!a.createdMs || !a.lastActiveMs) return null;
  if (a.lastActiveMs - a.createdMs >= RETURNED_AFTER_MS) return null;
  const email = (a.email || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at), domain = email.slice(at + 1);
  if (domain === 'cloudtestlabaccounts.com') return 'test-lab';
  if (domain === 'amazon.com') return 'store-reviewer';
  if (domain !== 'gmail.com') return null;
  const m = TESTER_FARM_LOCAL.exec(local);
  // the address is the whole display name run together, nothing more and nothing less
  return m && m[1] === lettersOf(a.displayName) ? 'tester-farm' : null;
}
