/**
 * Moonshot state for the portal (F-109): the current race, the team's calls, the league's
 * board and the published model, loaded once per signed-in team and refreshed after a confirm or
 * cancel. A small context beside the main store rather than inside it: the main store is the
 * lineup's; this is the server's answers, and nothing here is persisted.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealTeam } from '../data/team';
import type { BoardCall, MoonshotCall, MoonshotMenu, MoonshotModelDoc, MoonshotQuote } from '../data/moonshot';
import { cancelCall, confirmQuote, fetchBoard, fetchMenu, fetchQuote, loadCurrentRace, loadModel, loadTeamCalls, type CurrentRace, type QuoteRequest } from './moonshotApi';
import { auth } from './firebase';

export interface MoonshotCtx {
  race: CurrentRace | null;
  calls: MoonshotCall[];
  /** this team's call on the current race, if any (cancelled ones excluded) */
  current: MoonshotCall | null;
  board: BoardCall[];
  model: MoonshotModelDoc | null;
  /** the menu for one driver on the current race; cached per driver until the team's calls change */
  menu: (driverId: string) => Promise<MoonshotMenu>;
  quote: (req: Omit<QuoteRequest, 'teamId' | 'raceId'>) => Promise<MoonshotQuote>;
  confirm: (quoteId: string) => Promise<void>;
  cancel: (moonshotId: string) => Promise<void>;
  ready: boolean;
}

const Ctx = createContext<MoonshotCtx | null>(null);

export function MoonshotProvider({ team, children }: { team: RealTeam | null; children: ReactNode }) {
  const uid = auth().currentUser?.uid ?? null;
  const [race, setRace] = useState<CurrentRace | null>(null);
  const [calls, setCalls] = useState<MoonshotCall[]>([]);
  const [board, setBoard] = useState<BoardCall[]>([]);
  const [model, setModel] = useState<MoonshotModelDoc | null>(null);
  const [ready, setReady] = useState(false);
  const menus = useRef(new Map<string, Promise<MoonshotMenu>>());
  const teamId = team?.id ?? null, leagueId = team?.leagueId ?? null;

  // nothing loads without a signed-in team: the example payload (and the preview build the scroll
  // budget runs against) must make no network request here
  const active = !!uid && !!teamId;
  // the race once per team; the calls per team; the board per league and race
  useEffect(() => {
    let live = true;
    if (!active) { setRace(null); return; }
    loadCurrentRace().then((r) => { if (live) setRace(r); }).catch(() => undefined);
    return () => { live = false; };
  }, [active]);
  const reloadCalls = useCallback(async () => {
    menus.current.clear();
    if (!uid || !teamId) { setCalls([]); return; }
    try { setCalls(await loadTeamCalls(uid, teamId)); } catch { /* a transport failure keeps what is shown */ }
  }, [uid, teamId]);
  useEffect(() => {
    let live = true;
    setReady(false);
    reloadCalls().finally(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [reloadCalls]);
  useEffect(() => {
    let live = true;
    if (!active || !leagueId || !race) { setBoard([]); return; }
    fetchBoard(leagueId, race.raceId).then((b) => { if (live) setBoard(b); }).catch(() => undefined);
    return () => { live = false; };
  }, [leagueId, race?.raceId, calls.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    if (!active || !race) { setModel(null); return; }
    loadModel(race.raceId).then((d) => { if (live) setModel(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [race?.raceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<MoonshotCtx>(() => ({
    race, calls, board, model, ready,
    current: race ? calls.find((c) => c.raceId === race.raceId && c.status !== 'CANCELLED') ?? null : null,
    menu: (driverId) => {
      if (!teamId || !race) return Promise.reject(new Error('No team or race'));
      const key = `${teamId}:${race.raceId}:${driverId}`;
      let p = menus.current.get(key);
      if (!p) { p = fetchMenu(teamId, race.raceId, driverId); menus.current.set(key, p); p.catch(() => menus.current.delete(key)); }
      return p;
    },
    quote: (req) => {
      if (!teamId || !race) return Promise.reject(new Error('No team or race'));
      return fetchQuote({ ...req, teamId, raceId: race.raceId });
    },
    confirm: async (quoteId) => { await confirmQuote(quoteId); await reloadCalls(); },
    cancel: async (moonshotId) => { await cancelCall(moonshotId); await reloadCalls(); },
  }), [race, calls, board, model, ready, teamId, reloadCalls]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMoonshot = (): MoonshotCtx | null => useContext(Ctx);
