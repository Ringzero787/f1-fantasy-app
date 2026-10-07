/**
 * Live positions for the race-day Moonshot card (F-108, SPEC §17; F-111). The device asks nobody
 * but Firestore: one server sweep writes `races/{raceId}/live/positions` each minute while the
 * race is in its window, and this hook listens to it. `config/app.moonshot.liveTiming` governs
 * whether the card renders live positions at all; off, it shows PENDING and settles from the
 * official result like everything else.
 */
import { useEffect, useMemo, useState } from 'react';
import { moonshotService, type LivePositionsDoc } from '../../services/moonshot.service';
import type { RaceWindow } from '../grid/moonshot';

export function useMoonshotLive(race: { id: string } | null, raceWin: RaceWindow, enabled: boolean): { positions: Map<string, number>; sessionKey: number | null; updatedAt: number | null } {
  const [doc, setDoc] = useState<LivePositionsDoc | null>(null);
  const raceId = race?.id ?? null;
  const live = enabled && raceWin === 'live';

  useEffect(() => {
    setDoc(null);
    if (!raceId || !live) return;
    return moonshotService.subscribeLivePositions(raceId, setDoc);
  }, [raceId, live]);

  const positions = useMemo(() => new Map(Object.entries(doc?.byDriver ?? {})), [doc]);
  return { positions, sessionKey: doc?.sessionKey ?? null, updatedAt: doc?.atMs ?? null };
}
