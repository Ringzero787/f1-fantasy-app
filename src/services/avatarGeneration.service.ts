import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../config/firebase';

export type AvatarType = 'league' | 'team' | 'user';
export type AvatarStyle = 'simple' | 'detailed';

interface GenerateAvatarResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * Generate a placeholder avatar URL using DiceBear API (no API key needed)
 */
function generateDemoAvatarUrl(name: string, type: AvatarType): string {
  const seed = encodeURIComponent(name);
  const styles: Record<AvatarType, string> = {
    league: 'shapes',
    team: 'bottts',
    user: 'avataaars',
  };
  const style = styles[type];
  return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&size=256`;
}

/**
 * Generate an avatar image via the generateAvatarFn Cloud Function.
 * The Gemini API key is kept server-side — never exposed to the client.
 * Falls back to DiceBear on error.
 */
export async function generateAvatar(
  name: string,
  type: AvatarType,
  entityId: string,
  style: AvatarStyle = 'detailed'
): Promise<GenerateAvatarResult> {
  try {
    const generateAvatarFn = httpsCallable<
      { name: string; type: string; entityId: string; style: string },
      { imageUrl: string }
    >(functions, 'generateAvatarFn', { timeout: 120_000 });

    const result = await generateAvatarFn({ name, type, entityId, style });
    return { success: true, imageUrl: result.data.imageUrl };
  } catch (error: any) {
    console.error('Cloud avatar generation failed:', error);

    // Fall back to DiceBear placeholder
    const fallbackUrl = generateDemoAvatarUrl(name, type);
    try {
      await saveAvatarUrlToEntity(type, entityId, fallbackUrl);
    } catch {
      // non-critical — URL still returned to caller
    }

    return {
      success: true,
      imageUrl: fallbackUrl,
      error: `AI generation failed (using placeholder): ${error.message || error}`,
    };
  }
}

/**
 * Get existing avatar URL for an entity
 */
export async function getAvatarUrl(
  type: AvatarType,
  entityId: string
): Promise<string | null> {
  try {
    const collectionName = type === 'league' ? 'leagues' :
                           type === 'team' ? 'fantasyTeams' : 'users';
    const docRef = doc(db, collectionName, entityId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data()?.avatarUrl || null;
    }
    return null;
  } catch (error) {
    console.error('Error getting avatar URL:', error);
    return null;
  }
}

/**
 * Check if avatar generation is available.
 * Always true — Cloud Function handles Gemini, DiceBear is the fallback.
 */
export function isAvatarGenerationAvailable(): boolean {
  return true;
}

/**
 * Regenerate avatar for an entity
 */
export async function regenerateAvatar(
  name: string,
  type: AvatarType,
  entityId: string,
  style: AvatarStyle = 'detailed'
): Promise<GenerateAvatarResult> {
  return generateAvatar(name, type, entityId, style);
}

/**
 * Save a preset avatar URL (e.g., from DiceBear) to an entity
 */
export async function saveAvatarUrl(
  type: AvatarType,
  entityId: string,
  imageUrl: string
): Promise<GenerateAvatarResult> {
  try {
    await saveAvatarUrlToEntity(type, entityId, imageUrl);
    return { success: true, imageUrl };
  } catch (error) {
    console.error('Error saving avatar URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save avatar',
    };
  }
}

async function saveAvatarUrlToEntity(
  type: AvatarType,
  entityId: string,
  imageUrl: string
): Promise<void> {
  const collectionName = type === 'league' ? 'leagues' :
                         type === 'team' ? 'fantasyTeams' : 'users';
  const docRef = doc(db, collectionName, entityId);
  await updateDoc(docRef, {
    avatarUrl: imageUrl,
    avatarGeneratedAt: new Date().toISOString(),
  });
}
