/**
 * Sync race schedules from OpenF1 API to Firestore.
 * Runs twice daily to pick up any FIA schedule changes.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { SEASON_YEAR, ROUND_TO_RACE_ID } from './config';
import { fetchSessions, deriveRoundNumbers, type OpenF1Session } from './openf1Client';

const db = admin.firestore();

/**
 * Build a schedule object from OpenF1 sessions for a given meeting.
 */
function buildSchedule(
  meetingSessions: OpenF1Session[],
): Record<string, admin.firestore.Timestamp> {
  const schedule: Record<string, admin.firestore.Timestamp> = {};

  const sessionMap: Record<string, string> = {
    'Practice 1': 'fp1',
    'Practice 2': 'fp2',
    'Practice 3': 'fp3',
    'Qualifying': 'qualifying',
    'Sprint Qualifying': 'sprintQualifying',
    'Sprint': 'sprint',
    'Race': 'race',
  };

  for (const session of meetingSessions) {
    const key = sessionMap[session.session_name];
    if (key && session.date_start) {
      schedule[key] = admin.firestore.Timestamp.fromDate(new Date(session.date_start));
    }
  }

  return schedule;
}

/**
 * Scheduled: sync race schedules from OpenF1 twice daily.
 * Updates schedule timestamps on race docs if they've changed.
 */
export const syncRaceSchedules = onSchedule(
  { schedule: 'every 12 hours', timeoutSeconds: 120 },
  async () => {
    console.log('[ScheduleSync] Fetching sessions from OpenF1...');

    const allSessions = await fetchSessions(SEASON_YEAR);
    const yearSessions = allSessions.filter(s => s.year === SEASON_YEAR);

    if (yearSessions.length === 0) {
      console.log('[ScheduleSync] No sessions found for', SEASON_YEAR);
      return;
    }

    const roundMap = deriveRoundNumbers(yearSessions);
    let updatedCount = 0;

    for (const [meetingKey, round] of roundMap.entries()) {
      const raceId = ROUND_TO_RACE_ID[round];
      if (!raceId) {
        console.log(`[ScheduleSync] No race ID mapping for round ${round}`);
        continue;
      }

      const meetingSessions = yearSessions.filter(s => s.meeting_key === meetingKey);
      const newSchedule = buildSchedule(meetingSessions);

      if (!newSchedule.race) {
        continue; // Skip if no race session time
      }

      // Read current schedule from Firestore
      const raceRef = db.collection('races').doc(raceId);
      const raceDoc = await raceRef.get();

      if (!raceDoc.exists) {
        console.log(`[ScheduleSync] Race doc ${raceId} not found, skipping`);
        continue;
      }

      const currentSchedule = raceDoc.data()?.schedule || {};

      // Check if any schedule times have changed
      let hasChanges = false;
      for (const [key, timestamp] of Object.entries(newSchedule)) {
        const current = currentSchedule[key];
        if (!current || current.toMillis() !== timestamp.toMillis()) {
          hasChanges = true;
          break;
        }
      }

      if (hasChanges) {
        // Build update with dot notation to merge, not overwrite
        const updateData: Record<string, admin.firestore.Timestamp> = {};
        for (const [key, timestamp] of Object.entries(newSchedule)) {
          updateData[`schedule.${key}`] = timestamp;
        }
        await raceRef.update(updateData);
        updatedCount++;
        console.log(`[ScheduleSync] Updated schedule for ${raceId} (round ${round})`);
      }
    }

    console.log(`[ScheduleSync] Done. Updated ${updatedCount} race schedule(s).`);
  },
);
