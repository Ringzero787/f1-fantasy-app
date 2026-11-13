// F-143: the ace call after a confirmed lineup is asked for once and lapses.
import { useAceCallPrompt, aceCallWorthOpening, ACE_CALL_WINDOW_MS } from '../../src/simple/grid/aceCallPrompt';

describe('ace call after save', () => {
  beforeEach(() => useAceCallPrompt.setState({ requestedAt: null }));
  it('answers once inside the window', () => {
    useAceCallPrompt.getState().request(1000);
    expect(useAceCallPrompt.getState().consume(1000 + 500)).toBe(true);
    expect(useAceCallPrompt.getState().consume(1000 + 600)).toBe(false);
  });
  it('lapses after the window and clears', () => {
    useAceCallPrompt.getState().request(1000);
    expect(useAceCallPrompt.getState().consume(1000 + ACE_CALL_WINDOW_MS + 1)).toBe(false);
    expect(useAceCallPrompt.getState().requestedAt).toBeNull();
  });
  it('nothing asked, nothing answered', () => {
    expect(useAceCallPrompt.getState().consume()).toBe(false);
  });
  it('opens for a new ace or a move, not a keep', () => {
    expect(aceCallWorthOpening({ kind: 'set' })).toBe(true);
    expect(aceCallWorthOpening({ kind: 'move' })).toBe(true);
    expect(aceCallWorthOpening({ kind: 'keep' })).toBe(false);
    expect(aceCallWorthOpening(null)).toBe(false);
  });
});
