/** The signed-in user's real team and the next round, read from the same documents the app reads. */
import { firestore } from './firebase';
import { countdown, lockTime, type RaceSchedule } from './lock';

export interface Account { teamName: string | null; bank: number | null; leagueName: string | null; roundLabel: string | null; firstSession: string | null; locksIn: string | null }
export const EMPTY_ACCOUNT: Account = { teamName: null, bank: null, leagueName: null, roundLabel: null, firstSession: null, locksIn: null };

const toDate = (v: unknown): Date | undefined => (v && typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : undefined);

export async function loadAccount(uid: string): Promise<Account> {
  const { m, db } = await firestore();
  const out: Account = { ...EMPTY_ACCOUNT };
  const teams = await m.getDocs(m.query(m.collection(db, 'fantasyTeams'), m.where('userId', '==', uid), m.limit(2)));
  const team = teams.docs[0]?.data();
  if (team) {
    out.teamName = typeof team.name === 'string' ? team.name : null;
    out.bank = typeof team.budget === 'number' ? team.budget : null;
    if (typeof team.leagueId === 'string') {
      const league = await m.getDoc(m.doc(db, 'leagues', team.leagueId)).catch(() => null);
      out.leagueName = (league?.data()?.name as string | undefined) ?? null;
    }
  }
  // The round being run, else the next one. Asking only for `upcoming` skipped the weekend in
  // progress, so the bar announced the next race while every projection on the page was for the one
  // being run — the page contradicted itself from the first line.
  const rounds = await m.getDocs(m.query(
    m.collection(db, 'races'),
    m.where('seasonId', '==', '2026'),
    m.where('status', 'in', ['in_progress', 'upcoming']),
    m.orderBy('round'),
    m.limit(6),
  )).catch(() => null);
  const docs = (rounds?.docs ?? []).map((d) => d.data());
  const race = docs.find((r) => r.status === 'in_progress') ?? docs[0];
  if (race) {
    const s = (race.schedule ?? {}) as Record<string, unknown>;
    const schedule: RaceSchedule = { fp1: toDate(s.fp1), fp3: toDate(s.fp3), sprintQualifying: toDate(s.sprintQualifying), qualifying: toDate(s.qualifying), race: toDate(s.race) };
    out.roundLabel = `RD ${race.round} · ${String(race.city ?? race.country ?? race.name ?? '').toUpperCase()}`;
    out.firstSession = schedule.fp1 ? `FP1 ${schedule.fp1.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` : null;
    out.locksIn = countdown(new Date(), lockTime(schedule, race.hasSprint === true));
  }
  return out;
}
