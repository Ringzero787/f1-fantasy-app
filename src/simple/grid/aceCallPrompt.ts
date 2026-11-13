/**
 * F-143: after the player confirms a lineup, Pit Wall makes its ace call straight away. The picker
 * asks for it on a successful save; the Team screen answers it once, by opening the tile sheet on
 * the driver Pit Wall would ace (the sheet leads with the ace call and its MAKE ACE button).
 *
 * A request is good for a short window only, so a save that never reaches the Team screen (the
 * player went elsewhere) does not pop a sheet the next time they happen to open it.
 */
import { create } from 'zustand';

export const ACE_CALL_WINDOW_MS = 30_000;

interface AceCallPromptState {
  requestedAt: number | null;
  request: (now?: number) => void;
  /** True once per request, inside the window; clears the request either way. */
  consume: (now?: number) => boolean;
}

export const useAceCallPrompt = create<AceCallPromptState>()((set, get) => ({
  requestedAt: null,
  request: (now = Date.now()) => set({ requestedAt: now }),
  consume: (now = Date.now()) => {
    const at = get().requestedAt;
    if (at == null) return false;
    set({ requestedAt: null });
    return now - at <= ACE_CALL_WINDOW_MS;
  },
}));

/** Which advice is worth interrupting for: a new ace or a move. A keep says the player is right. */
export const aceCallWorthOpening = (advice: { kind: 'set' | 'move' | 'keep' } | null): boolean =>
  !!advice && advice.kind !== 'keep';
