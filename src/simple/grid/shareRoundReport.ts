/**
 * Hand the round report to the system share sheet (F-120 follow-up).
 *
 * Tries an image of the share card first (view-shot + expo-sharing). Text is the fallback:
 * capture needs a store build that ships those modules, and F-083 already proved text pastes
 * into Slack, SMS and email. The formatter is pure (`roundReportShare.ts`); this file is the
 * native edge.
 */
import { shareText } from './shareText';
import { roundReportText, type RoundReportShareInput } from './roundReportShare';

export async function shareRoundReport(
  input: RoundReportShareInput,
  capture?: () => Promise<string | null>,
): Promise<boolean> {
  const message = roundReportText(input);
  if (!message) return false;
  const subject = `${input.leagueName} round report`;
  if (capture) {
    try {
      const uri = await capture();
      if (uri) {
        try {
          // Optional until the next store build ships expo-sharing.
          const Sharing = require('expo-sharing') as { isAvailableAsync: () => Promise<boolean>; shareAsync: (u: string, o: { mimeType: string; dialogTitle: string }) => Promise<void> };
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: subject });
            return true;
          }
        } catch { /* Share.share still takes a file URL on iOS */ }
        const { Share } = require('react-native') as { Share: { share: (c: { url: string; message: string; title: string }) => Promise<unknown> } };
        await Share.share({ url: uri, message, title: subject });
        return true;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(reason)) console.warn('[share] round-report image failed:', reason);
    }
  }
  return shareText(message, subject, 'round-report');
}

export async function captureView(ref: { current: unknown }): Promise<string | null> {
  if (!ref.current) return null;
  try {
    const { captureRef } = require('react-native-view-shot') as { captureRef: (t: unknown, o: object) => Promise<string> };
    return await captureRef(ref.current, { format: 'png', quality: 1, result: 'tmpfile' });
  } catch {
    return null;
  }
}
