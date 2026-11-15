/**
 * Sync race schedules from OpenF1 API to Firestore.
 * Runs twice daily to pick up any FIA schedule changes.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { fetchSessions, type OpenF1Session } from './openf1Client';
import { MOVE_FLAG_MS, meetingForRace, seasonOfRace, sessionsBySeason, toMs } from './season';
import { openf1Secrets } from './openf1Auth';

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
 * The sync body: the number of race documents it updated. Separated from the schedule so a test can
 * drive it with a fake database and feed.
 *
 * F-149: each open race document is synced from its own season's calendar, to the meeting whose
 * Race starts within three days of the document's race time. Matching by round number is what once
 * wrote Bahrain's times onto singapore_2026. A race OpenF1 has moved by more than MOVE_FLAG_MS is
 * not followed: the window is centred on the stored time, so following every move would let the
 * feed walk a race (and its lock times) anywhere a few days at a time. The schedule monitor flags
 * it and an op moves it.
 */
export async function syncSchedules(
  db: admin.firestore.Firestore,
  fetch: (year: number) => Promise<OpenF1Session[]>,
): Promise<number> {
  const sessionsFor = sessionsBySeason(fetch);
  const racesSnap = await db.collection('races').where('status', '!=', 'completed').get();
  let updatedCount = 0;

  for (const raceDoc of racesSnap.docs) {
    const raceId = raceDoc.id;
    const data = raceDoc.data();
    if (data.status === 'cancelled') continue;
    const season = seasonOfRace(raceId, data);
    if (season == null) {
      console.error(`[ScheduleSync] ${raceId}: seasonId, race id year and race time do not agree on one season — not synced`);
      continue;
    }
    const raceMs = toMs(data.schedule?.race);
    const meeting = meetingForRace(await sessionsFor(season), season, raceMs);
    if (!meeting) {
      console.log(`[ScheduleSync] ${raceId}: no ${season} OpenF1 meeting with a Race within 3 days — not synced`);
      continue;
    }
    const round = data.round;
    const newSchedule = buildSchedule(meeting.sessions);

    if (!newSchedule.race) {
      continue; // Skip if no race session time
    }
    if (Math.abs(newSchedule.race.toMillis() - raceMs) > MOVE_FLAG_MS) {
      console.error(`[ScheduleSync] ${raceId}: OpenF1 moved the race ${((newSchedule.race.toMillis() - raceMs) / 3600e3).toFixed(1)} h — over 24 h is not followed; correct it by op`);
      continue;
    }

    const currentSchedule = data.schedule || {};

    // Check if any schedule times have changed
    let hasChanges = false;
    for (const [key, timestamp] of Object.entries(newSchedule)) {
      const current = currentSchedule[key];
      if (!current || toMs(current) !== timestamp.toMillis()) {
        hasChanges = true;
        break;
      }
    }

    // Keep the `hasSprint` boolean in sync with the authoritative OpenF1
    // schedule. If OpenF1 lists a Sprint session for the meeting, this is a
    // sprint weekend — set the flag. We only ever set it TRUE: a sprint round
    // whose sessions OpenF1 hasn't published yet still has hasSprint=true from
    // seed data, and clobbering that to false would hide the Sprint scope
    // until late. The race-time `sprint` key is the definitive marker.
    const isSprintWeekend = !!newSchedule.sprint;
    const currentHasSprint = data.hasSprint === true;
    const needsSprintFlag = isSprintWeekend && !currentHasSprint;

    if (hasChanges || needsSprintFlag) {
      // Build update with dot notation to merge, not overwrite
      const updateData: Record<string, admin.firestore.Timestamp | boolean> = {};
      for (const [key, timestamp] of Object.entries(newSchedule)) {
        updateData[`schedule.${key}`] = timestamp;
      }
      if (isSprintWeekend) {
        updateData.hasSprint = true;
      }
      await raceDoc.ref.update(updateData);
      updatedCount++;
      console.log(
        `[ScheduleSync] Updated schedule for ${raceId} (round ${round})` +
          (needsSprintFlag ? ' [set hasSprint=true]' : '')
      );
    }
  }
  return updatedCount;
}

/**
 * Scheduled: sync race schedules from OpenF1 twice daily.
 * Updates schedule timestamps on race docs if they've changed.
 */
export const syncRaceSchedules = onSchedule(
  { schedule: 'every 12 hours', timeoutSeconds: 120, secrets: openf1Secrets },
  async () => {
    console.log('[ScheduleSync] Fetching sessions from OpenF1...');
    const updatedCount = await syncSchedules(admin.firestore(), fetchSessions);
    console.log(`[ScheduleSync] Done. Updated ${updatedCount} race schedule(s).`);
  },
);
