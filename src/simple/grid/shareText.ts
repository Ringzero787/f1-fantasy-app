/**
 * Handing a block of text to whatever the player shares with (F-083, F-086).
 *
 * Two screens do this and the awkward parts are identical on both: dismissing the sheet is not a
 * failure and must stay silent, anything else is worth a line in the log because a share that
 * quietly does nothing is indistinguishable from a dead button, and `title` is not the chooser
 * heading — Android passes it to the receiving app as the subject, which fills in an email's
 * subject line, and iOS drops it.
 *
 * Getting that wrong in one place and right in the other is how the two drift apart.
 */
import { Share } from 'react-native';

/** Returns false when there was nothing to share, so a caller can leave its control hidden. */
export async function shareText(message: string, subject: string, where: string): Promise<boolean> {
  if (!message) return false;
  try {
    await Share.share({ message, title: subject });
    return true;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (!/cancel/i.test(reason)) console.warn(`[share] ${where} share failed:`, reason);
    return false;
  }
}
