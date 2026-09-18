/**
 * Storage path for an uploaded avatar — pure. Must stay inside the
 * owner-scoped rule in storage.rules:
 *   match /avatars/{userId}/{type}/{fileId}  (write: auth.uid == userId, < 5 MB, image/*)
 * The old `profile-images/{id}.jpg` path matched no rule, so every upload was
 * denied by the catch-all.
 */
export type AvatarKind = 'user' | 'team' | 'league';

export function avatarStoragePath(authUid: string, kind: AvatarKind, entityId: string, contentType: string): string {
  const ext = (contentType.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg';
  const safeId = entityId.replace(/[^A-Za-z0-9_-]/g, '_');
  return `avatars/${authUid}/${kind}/${safeId}.${ext === 'jpeg' ? 'jpg' : ext}`;
}
