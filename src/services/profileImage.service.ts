import { firebaseAuth } from '../config/firebase';

// Firebase Storage bucket name from environment
const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '';

/**
 * Upload a profile image to Firebase Storage using REST API
 * This avoids Blob/ArrayBuffer issues in React Native
 */
export async function uploadProfileImage(
  userId: string,
  base64Data: string,
  contentType: string = 'image/jpeg'
): Promise<string> {
  // Get current user's auth token for authenticated upload
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to upload profile image');
  }

  const token = await user.getIdToken();

  // Create the storage path
  const extension = contentType.split('/')[1] || 'jpg';
  const path = `profile-images/${userId}.${extension}`;
  const encodedPath = encodeURIComponent(path);

  // Upload using Firebase Storage REST API
  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Firebase ${token}`,
      'Content-Type': contentType,
      'Content-Transfer-Encoding': 'base64',
    },
    body: base64Data,
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
