/**
 * Live positions for the race-day Moonshot card (F-108, SPEC §17). Finds the race session for
 * the current round in the OpenF1 feed (which the admin screens use; no player screen did until
 * now) and polls positions every minute while the race window is open. Polling is off unless
 * `config/app.moonshot.liveTiming` is on — the data arrangement (ADR-001) covers the Pit Wall
 * ingest, not every player's device, so the owner switches this on deliberately. Off, the card
 * shows PENDING and settles from the official result like everything else.
 */
import { useEffect, useMemo, useState } from 'react';
import { openF1Service, type OpenF1Session, type OpenF1Position } from '../../services/openf1.service';
import { latestPositions, sessionForRace, type RaceWindow } from '../grid/moonshot';

const POLL_MS = 60 * 1000;

export function useMoonshotLive(race: { id: string; schedule?: { race?: Date | string | number | null }; seasonId?: string } | null, raceWin: RaceWindow, enabled: boolean): { positions: Map<string, number>; sessionKey: number | null; updatedAt: number | null } {
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [rows, setRows] = useState<Array<{ driver_number: number; position: number; date: string }>>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const raceId = race?.id ?? null;
  const start = race?.schedule?.race ?? null;
  const year = start ? new Date(start as string | number | Date).getUTCFullYear() : new Date().getUTCFullYear();
  const live = enabled && raceWin === 'live';

  // the session, once per race; a per-run flag so an answer for the previous race cannot land here
  useEffect(() => {
    let stale = false;
    setSessionKey(null); setRows([]); setUpdatedAt(null);
    if (!raceId || !live) return;
    openF1Service.getRaceSessions(year).then((sessions: OpenF1Session[]) => {
      if (stale) return;
      const s = sessionForRace(sessions, start);
      setSessionKey(s ? s.session_key : null);
    }).catch((e: unknown) => console.warn('[moonshot live] sessions:', e));
    return () => { stale = true; };
  }, [raceId, live, year, start]);

  // the positions, every minute while live
  useEffect(() => {
    if (!sessionKey || !live) return;
    let stop = false;
    const tick = () => openF1Service.getPositions(sessionKey).then((p: OpenF1Position[]) => { if (!stop) { setRows(p); setUpdatedAt(Date.now()); } }).catch((e: unknown) => console.warn('[moonshot live] positions:', e));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [sessionKey, live]);

  const positions = useMemo(() => {
    const byNumber = latestPositions(rows);
    const out = new Map<string, number>();
    for (const [n, pos] of byNumber) {
      const id = openF1Service.driverNumberToId(n);
      if (id) out.set(id, pos);
    }
    return out;
  }, [rows]);

  return { positions, sessionKey, updatedAt };
}
