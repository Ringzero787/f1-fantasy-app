/**
 * Live positions for the race-day Moonshot card (F-108, SPEC §17). Finds the race session for
 * the current round in the timing feed the app already uses (OpenF1) and polls positions every
 * minute while the race window is open. Returns the latest position per driver id, or an empty
 * map when the feed has nothing yet — the card then shows PENDING.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { openF1Service, type OpenF1Session, type OpenF1Position } from '../../services/openf1.service';
import { latestPositions, sessionForRace, type RaceWindow } from '../grid/moonshot';

const POLL_MS = 60 * 1000;

export function useMoonshotLive(race: { id: string; schedule?: { race?: Date | string | number | null }; seasonId?: string } | null, window: RaceWindow): { positions: Map<string, number>; sessionKey: number | null; updatedAt: number | null } {
  const [sessionKey, setSessionKey] = useState<number | null>(null);
  const [rows, setRows] = useState<Array<{ driver_number: number; position: number; date: string }>>([]);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const raceId = race?.id ?? null;
  const start = race?.schedule?.race ?? null;
  const year = start ? new Date(start as string | number | Date).getUTCFullYear() : new Date().getUTCFullYear();
  const cancelled = useRef(false);

  // the session, once per race
  useEffect(() => {
    cancelled.current = false;
    setSessionKey(null); setRows([]); setUpdatedAt(null);
    if (!raceId || window !== 'live') return;
    openF1Service.getRaceSessions(year).then((sessions: OpenF1Session[]) => {
      if (cancelled.current) return;
      const s = sessionForRace(sessions, start);
      setSessionKey(s ? s.session_key : null);
    }).catch((e: unknown) => console.warn('[moonshot live] sessions:', e));
    return () => { cancelled.current = true; };
  }, [raceId, window, year, start]);

  // the positions, every minute while live
  useEffect(() => {
    if (!sessionKey || window !== 'live') return;
    let stop = false;
    const tick = () => openF1Service.getPositions(sessionKey).then((p: OpenF1Position[]) => { if (!stop) { setRows(p); setUpdatedAt(Date.now()); } }).catch((e: unknown) => console.warn('[moonshot live] positions:', e));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [sessionKey, window]);

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
