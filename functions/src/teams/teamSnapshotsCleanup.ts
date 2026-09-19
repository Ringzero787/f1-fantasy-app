/**
 * Race snapshots (F-029) live in a subcollection, and deleting a Firestore
 * document leaves its subcollections behind. Whenever a team is deleted — by
 * its owner in the app, or by onUserDeleted when an account is removed — this
 * removes `fantasyTeams/{teamId}/raceSnapshots/*` with it.
 */
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

const db = admin.firestore();

export const onFantasyTeamDeleted = onDocumentDeleted(
  { document: 'fantasyTeams/{teamId}', retry: true },
  async (event) => {
    const ref = db.collection('fantasyTeams').doc(event.params.teamId).collection('raceSnapshots');
    // Idempotent: a retry finds fewer (or no) documents and finishes.
    for (;;) {
      const page = await ref.limit(400).get();
      if (page.empty) return;
      const batch = db.batch();
      page.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  },
);
