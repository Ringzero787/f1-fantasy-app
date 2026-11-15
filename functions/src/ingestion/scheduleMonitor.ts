/**
 * Automated F1 Schedule Monitor
 *
 * Runs daily, checks the official F1 calendar via OpenF1 API for changes:
 * - Cancelled races
 * - Date changes
 * - New races added
 *
 * Automatically updates Firestore and can notify admins of changes.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { fetchSessions, type OpenF1Session } from './openf1Client';
import { MOVE_FLAG_MS, meetingForRace, seasonOfRace, sessionsBySeason, toMs } from './season';
import { openf1Secrets } from './openf1Auth';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The monitor body: the lines it reports, after any auto-cancel it applied. Separated from the
 * schedule so a test can drive it with a fake database and feed.
 *
 * F-149: each race is checked against its own season's OpenF1 calendar. With one global year a
 * 2027 race would have found no 2026 session near it and been auto-cancelled the day it ran.
 */
export async function checkScheduleChanges(
  db: admin.firestore.Firestore,
  fetch: (year: number) => Promise<OpenF1Session[]>,
  nowMs: number,
): Promise<string[]> {
  const sessionsFor = sessionsBySeason(fetch);
  const racesSnap = await db.collection('races').get();
  const changes: string[] = [];

  for (const raceDoc of racesSnap.docs) {
    const race = raceDoc.data();
    const raceId = raceDoc.id;
    const round = race.round;

    if (race.status === 'completed' || race.status === 'cancelled') {
      continue; // Don't touch finished or already-cancelled races
    }

    // A race whose season cannot be read is never compared with a calendar, so never cancelled
    const season = seasonOfRace(raceId, race);
    if (season == null) {
      console.error(`[ScheduleMonitor] ${raceId}: seasonId, race id year and race time do not agree on one season — skipped`);
      changes.push(`CHECK: ${race.name} (R${round}) — seasonId, race id and race time disagree on the season`);
      continue;
    }

    const raceMs = toMs(race.schedule?.race);
    if (!Number.isFinite(raceMs)) continue;
    const sessions = await sessionsFor(season);
    const daysUntilRace = (raceMs - nowMs) / DAY_MS;
    if (daysUntilRace >= 14 || daysUntilRace <= -1) continue;

    // No calendar at all for the season (not published yet, or the feed answered empty) says nothing
    // about this race: flag it, never cancel on it
    if (sessions.length === 0) {
      changes.push(`CHECK: ${race.name} (R${round}) — OpenF1 lists no ${season} sessions at all; not checked`);
      continue;
    }

    // Any OpenF1 session within 3 days of the scheduled race. Deliberately loose: this alone decides
    // the auto-cancel below, which must not fire on a race OpenF1 has only moved.
    const hasNearbySessions = sessions.some((s) => Math.abs(new Date(s.date_start).getTime() - raceMs) < 3 * DAY_MS);
    if (!hasNearbySessions) {
      console.warn(`[ScheduleMonitor] WARNING: ${race.name} (R${round}) is in ${Math.round(daysUntilRace)} days but OpenF1 has no sessions. May be cancelled.`);
      changes.push(`WARNING: ${race.name} (R${round}) — ${Math.round(daysUntilRace)} days away, no OpenF1 sessions found`);

      // Auto-cancel if race date has passed
      if (daysUntilRace < 0) {
        await raceDoc.ref.update({ status: 'cancelled' });
        changes.push(`AUTO-CANCELLED: ${race.name} (R${round})`);
      }
      continue;
    }

    // F-149: the strict match every ingestion job uses. Without it the race is not synced, fetched or
    // scored, so say so here rather than leave it to a log line nobody reads.
    const meeting = meetingForRace(sessions, season, raceMs);
    if (!meeting) {
      changes.push(`CHECK: ${race.name} (R${round}) — no ${season} OpenF1 Race within 3 days of its race time; it will not be synced or scored until its schedule is corrected by op`);
      continue;
    }
    const moveMs = new Date(meeting.race.date_start).getTime() - raceMs;
    if (Math.abs(moveMs) > MOVE_FLAG_MS) {
      changes.push(`CHECK: ${race.name} (R${round}) — OpenF1 has the race ${(moveMs / 3600e3).toFixed(1)} h from its race time; the sync does not follow moves over 24 h, correct it by op`);
    }
  }

  if (changes.length > 0) {
    console.log(`[ScheduleMonitor] ${changes.length} changes detected:`);
    changes.forEach(c => console.log(`  - ${c}`));

    // Store alert for admin review
    await db.collection('notifications').add({
      type: 'schedule_change',
      title: 'Schedule Changes Detected',
      body: changes.join('\n'),
      changes,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      read: false,
      userId: 'system',
    });
  } else {
    console.log('[ScheduleMonitor] No changes detected');
  }
  return changes;
}

export const monitorScheduleChanges = onSchedule(
  { schedule: 'every day 06:00', timeoutSeconds: 120, secrets: openf1Secrets },
  async () => {
    console.log('[ScheduleMonitor] Checking for schedule changes...');
    try {
      await checkScheduleChanges(admin.firestore(), fetchSessions, Date.now());
    } catch (err) {
      console.error('[ScheduleMonitor] Error:', err);
    }
  }
);
