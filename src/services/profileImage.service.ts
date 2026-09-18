import { firebaseAuth } from '../config/firebase';
import { avatarStoragePath, type AvatarKind } from '../utils/avatarPath';

// Firebase Storage bucket name from environment
const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '';

/**
 * Upload a profile image to Firebase Storage using REST API
 * This avoids Blob/ArrayBuffer issues in React Native
 */
export async function uploadProfileImage(
  userId: string,
  base64Data: string,
  contentType: string = 'image/jpeg',
  kind: AvatarKind = 'user'
): Promise<string> {
  // Get current user's auth token for authenticated upload
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to upload profile image');
  }

  const token = await user.getIdToken();

  // Owner-scoped path the storage rules allow (avatars/{auth.uid}/{kind}/{id})
  const path = avatarStoragePath(user.uid, kind, userId, contentType);
  const encodedPath = encodeURIComponent(path);

  // Upload using Firebase Storage REST API
  // React Native fetch doesn't support Uint8Array body — use Blob instead
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: contentType });

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Firebase ${token}`,
      'Content-Type': contentType,
    },
    body: blob,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Storage upload failed:', response.status, errorText);
    throw new Error(`Failed to upload image: ${response.status}`);
  }

  const result = await response.json();

  // Construct the download URL
  const downloadToken = result.downloadTokens;
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${downloadToken}`;

  return downloadUrl;
}
