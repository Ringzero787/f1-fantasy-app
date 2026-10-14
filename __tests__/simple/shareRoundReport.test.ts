/**
 * Image share: dismissing the sheet is success and must not open a second sheet (G06).
 * Text is only the fallback when capture is unavailable.
 */
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));
jest.mock('react-native', () => ({
  Share: { share: jest.fn() },
}));
jest.mock('../../src/simple/grid/shareText', () => ({
  shareText: jest.fn(async () => true),
}));

import { shareRoundReport } from '../../src/simple/grid/shareRoundReport';
import { shareText } from '../../src/simple/grid/shareText';

const Sharing = require('expo-sharing') as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};
const { Share } = require('react-native') as { Share: { share: jest.Mock } };

const input = {
  report: {
    your: { place: 2, of: 3, points: 250, delta: null as number | null },
    podium: [],
    moonshots: [],
    callOfTheRound: null,
    callouts: [],
    estimated: false,
  },
  label: 'RD 19',
  leagueName: 'Sunday Club',
  inviteCode: 'SUN-2601',
};

describe('shareRoundReport cancel', () => {
  beforeEach(() => {
    Sharing.isAvailableAsync.mockReset();
    Sharing.shareAsync.mockReset();
    Share.share.mockReset();
    (shareText as jest.Mock).mockClear();
  });

  it('a cancelled expo-sharing sheet does not open RN Share or text', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(true);
    Sharing.shareAsync.mockRejectedValue(new Error('User cancelled share'));
    const ok = await shareRoundReport(input as never, async () => 'file:///tmp/report.png');
    expect(ok).toBe(true);
    expect(Share.share).not.toHaveBeenCalled();
    expect(shareText).not.toHaveBeenCalled();
  });

  it('a cancelled RN Share sheet does not fall through to text', async () => {
    Sharing.isAvailableAsync.mockResolvedValue(false);
    Share.share.mockRejectedValue(new Error('Share cancelled'));
    const ok = await shareRoundReport(input as never, async () => 'file:///tmp/report.png');
    expect(ok).toBe(true);
    expect(shareText).not.toHaveBeenCalled();
  });

  it('falls back to text when capture is missing', async () => {
    const ok = await shareRoundReport(input as never);
    expect(ok).toBe(true);
    expect(shareText).toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });
});
