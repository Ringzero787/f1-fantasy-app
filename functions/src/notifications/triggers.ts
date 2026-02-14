import {
  onDocumentCreated,
  onDocumentUpdated,
} from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { sendPushToLeague, sendPushToUsers } from './sendPush';

const db = admin.firestore();

/**
 * When a new announcement is created in a league, send push to all league members.
 */
export const onAnnouncementCreated = onDocumentCreated(
  'leagues/{leagueId}/announcements/{announcementId}',
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.isActive) return;

    const leagueId = event.params.leagueId;
    const leagueName = data.leagueName || 'Your league';
    const message = (data.message as string) || '';
    const preview = message.length > 80 ? message.slice(0, 80) + '...' : message;

    await sendPushToLeague(
      leagueId,
      `${leagueName}`,
      preview,
      { type: 'announcement', leagueId, announcementId: event.params.announcementId },
      data.authorId, // Don't notify the author
    );
  },
);

/**
 * When an article status changes to 'approved', notify all users.
 */
export const onArticleApproved = onDocumentUpdated(
  'articles/{articleId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only trigger when status changes to approved
    if (before.status === after.status || after.status !== 'approved') return;

    const title = (after.title as string) || 'New Story';
    const summary = (after.summary as string) || '';
    const preview = summary.length > 100 ? summary.slice(0, 100) + '...' : summary;

    // Get all user IDs
    const usersSnap = await db.collection('users').select().get();
    const userIds = usersSnap.docs.map((doc) => doc.id);

    await sendPushToUsers(
      userIds,
      `New Story: ${title}`,
      preview,
      { type: 'new_story', articleId: event.params.articleId },
    );
  },
);

/**
 * When a race status changes to 'completed', notify all users.
 */
export const onRaceCompletedNotify = onDocumentUpdated(
  'races/{raceId}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    // Only trigger when status changes to completed
    if (before.status === after.status || after.status !== 'completed') return;

    const raceName = (after.name as string) || 'Race';

    // Get all user IDs
    const usersSnap = await db.collection('users').select().get();
    const userIds = usersSnap.docs.map((doc) => doc.id);

    await sendPushToUsers(
      userIds,
      'Race Results',
      `${raceName} scores are in! Check your standings.`,
      { type: 'results_available', raceId: event.params.raceId },
    );
  },
);
