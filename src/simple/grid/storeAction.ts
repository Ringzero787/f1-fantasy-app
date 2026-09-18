/**
 * The team store reports failures by setting `error` instead of throwing.
 * Run one store action and resolve to its error message (or null), so callers
 * can alert and decide what to do next (e.g. keep a sheet open on failure).
 */
export interface ErrorSlot {
  clear: () => void;
  read: () => string | null | undefined;
}

export async function runStoreAction(fn: () => Promise<void> | void, slot: ErrorSlot): Promise<string | null> {
  slot.clear();
  try {
    await fn();
  } catch (e) {
    return e instanceof Error ? e.message : 'Something went wrong.';
  }
  return slot.read() || null;
}
