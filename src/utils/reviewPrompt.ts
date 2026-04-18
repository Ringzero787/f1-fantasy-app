import * as StoreReview from 'expo-store-review';
import { usePrefsStore } from '../store/prefs.store';

const MIN_SESSIONS = 5;
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Request an in-app review if all conditions are met:
 * - StoreReview is available on this device
 * - Haven't prompted before
 * - At least 5 sessions
 * - Not within 30 days of last prompt
 *
 * Safe to call from anywhere — silently bails if conditions aren't met.
 */
export async function maybeRequestReview(): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const { hasPromptedReview, sessionCount, lastReviewPromptDate, markReviewPrompted } =
      usePrefsStore.getState();

    if (hasPromptedReview) return;
    if (sessionCount < MIN_SESSIONS) return;
    if (lastReviewPromptDate && Date.now() - lastReviewPromptDate < COOLDOWN_MS) return;

    await StoreReview.requestReview();
    markReviewPrompted();
  } catch {
    // Never crash the app over a review prompt
  }
}
