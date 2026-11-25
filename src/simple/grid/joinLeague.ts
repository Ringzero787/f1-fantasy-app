/**
 * Join a league by its code and put the player's team in it: one path for the League Manager's
 * code entry and public search (F-175), so the two cannot drift. A join into a league that needs
 * approval leaves the player pending; the team is attached either way, as the manager always did.
 */
import { useLeagueStore } from '../../store/league.store';

export async function joinByCodeAndAttach(code: string, userId: string, userName: string, attach: (leagueId: string) => Promise<void>): Promise<void> {
  await useLeagueStore.getState().joinLeagueByCode(code, userId, userName);
  const joined = useLeagueStore.getState().currentLeague;
  if (joined) await attach(joined.id);
}
