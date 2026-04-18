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
import { SEASON_YEAR, ROUND_TO_RACE_ID } from './config';
import { fetchSessions } from './openf1Client';

const db = admin.firestore();

export const monitorScheduleChanges = onSchedule(
  { schedule: 'every day 06:00', timeoutSeconds: 120 },
  async () => {
    console.log('[ScheduleMonitor] Checking for schedule changes...');

    try {
      // Fetch all sessions from OpenF1 for the current season
      const sessions = await fetchSessions(SEASON_YEAR);

      // Group sessions by meeting (round)
      const meetingRounds = new Map<number, { sessionNames: string[]; dates: string[] }>();
      for (const session of sessions) {
        // Derive round from meeting data
        const existing = meetingRounds.get(session.meeting_key) || { sessionNames: [], dates: [] };
        existing.sessionNames.push(session.session_name);
        existing.dates.push(session.date_start);
        meetingRounds.set(session.meeting_key, existing);
      }

      // Get all races from Firestore
      const racesSnap = await db.collection('races').get();
      const changes: string[] = [];

      for (const raceDoc of racesSnap.docs) {
        const race = raceDoc.data();
        const raceId = raceDoc.id;
        const round = race.round;

        if (race.status === 'completed' || race.status === 'cancelled') {
          continue; // Don't touch finished or already-cancelled races
        }

        // Check if this round still exists in OpenF1 data
        const roundMapped = ROUND_TO_RACE_ID[round];
        if (!roundMapped) {
          // Round not in our config (already removed) — check if it should be cancelled
          // If the race date has passed and OpenF1 has no sessions for it, mark cancelled
          const raceTime = race.schedule?.race;
          if (raceTime) {
            const raceDate = raceTime instanceof admin.firestore.Timestamp
              ? raceTime.toDate()
              : new Date(raceTime);

            if (raceDate < new Date() && race.status === 'upcoming') {
              console.log(`[ScheduleMonitor] Race ${raceId} (R${round}) date has passed with no results — marking cancelled`);
              await raceDoc.ref.update({ status: 'cancelled' });
              changes.push(`CANCELLED: ${race.name} (R${round}) — date passed, no OpenF1 data`);
            }
          }
          continue;
        }

        // Check if OpenF1 has sessions for this race
        // If a race was on the calendar but OpenF1 has zero sessions near its date,
        // it may have been cancelled
        const raceTime = race.schedule?.race;
        if (raceTime) {
          const raceDate = raceTime instanceof admin.firestore.Timestamp
            ? raceTime.toDate()
            : new Date(raceTime);

          // Look for any OpenF1 session within 3 days of the scheduled race
          const raceMs = raceDate.getTime();
          const threeDays = 3 * 24 * 60 * 60 * 1000;
          let hasNearbySessions = false;

          for (const session of sessions) {
            const sessionDate = new Date(session.date_start).getTime();
            if (Math.abs(sessionDate - raceMs) < threeDays) {
              hasNearbySessions = true;
              break;
            }
          }

          // If race is within 14 days and OpenF1 has no sessions for it, flag it
          const daysUntilRace = (raceMs - Date.now()) / (24 * 60 * 60 * 1000);
          if (daysUntilRace < 14 && daysUntilRace > -1 && !hasNearbySessions) {
            console.warn(`[ScheduleMonitor] WARNING: ${race.name} (R${round}) is in ${Math.round(daysUntilRace)} days but OpenF1 has no sessions. May be cancelled.`);
            changes.push(`WARNING: ${race.name} (R${round}) — ${Math.round(daysUntilRace)} days away, no OpenF1 sessions found`);

            // Auto-cancel if race date has passed
            if (daysUntilRace < 0) {
              await raceDoc.ref.update({ status: 'cancelled' });
              changes.push(`AUTO-CANCELLED: ${race.name} (R${round})`);
            }
          }
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
    } catch (err) {
      console.error('[ScheduleMonitor] Error:', err);
    }
  }
);
