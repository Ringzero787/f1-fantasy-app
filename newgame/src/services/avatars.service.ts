// avatars.service — image picker + Firebase Storage upload.
//
// Two entry points:
//   pickAndUploadUserAvatar(userId) → uploads to tl_avatars/{userId}/ + writes
//     photoURL on tl_users/{userId}, returns the download URL.
//   pickAndUploadLeagueAvatar(leagueId) → uploads to tl_league_avatars/{id}/ +
//     writes avatarUrl on leagues/{leagueId}, returns the download URL.
//
// Both prompt the system image picker. Returns null if the user cancels.

import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, storage } from '../config/firebase';

async function ensurePermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

async function pickImage(): Promise<{ uri: string; mimeType: string } | null> {
  const ok = await ensurePermission();
  if (!ok) throw new Error('Permission to access photos was denied');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
  };
}

async function uploadFromUri(path: string, uri: string, mimeType: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  const ref = storageRef(storage, path);
  await uploadBytes(ref, blob, { contentType: mimeType });
  return getDownloadURL(ref);
}

export const avatarsService = {
  // Returns the new download URL, or null if the user cancelled the picker.
  async pickAndUploadUserAvatar(userId: string): Promise<string | null> {
    const pick = await pickImage();
    if (!pick) return null;
    const ts = Date.now();
    const ext = pick.mimeType.includes('png') ? 'png' : 'jpg';
    const path = `tl_avatars/${userId}/avatar-${ts}.${ext}`;
    const url = await uploadFromUri(path, pick.uri, pick.mimeType);
    await updateDoc(doc(db, 'tl_users', userId), {
      photoURL: url,
      updatedAt: serverTimestamp(),
    });
    return url;
  },

  async pickAndUploadLeagueAvatar(leagueId: string): Promise<string | null> {
    const pick = await pickImage();
    if (!pick) return null;
    const ts = Date.now();
    const ext = pick.mimeType.includes('png') ? 'png' : 'jpg';
    const path = `tl_league_avatars/${leagueId}/avatar-${ts}.${ext}`;
    const url = await uploadFromUri(path, pick.uri, pick.mimeType);
    await updateDoc(doc(db, 'tl_leagues', leagueId), {
      avatarUrl: url,
      updatedAt: serverTimestamp(),
    });
    return url;
  },
};
