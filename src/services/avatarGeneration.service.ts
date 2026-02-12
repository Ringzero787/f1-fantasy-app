import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import * as FileSystem from 'expo-file-system';
import { db, firebaseAuth, storage } from '../config/firebase';

/**
 * Generate a placeholder avatar URL for demo mode using DiceBear API
 */
function generateDemoAvatarUrl(name: string, type: AvatarType): string {
  const seed = encodeURIComponent(name);
  // Use different styles for different types
  const styles: Record<AvatarType, string> = {
    league: 'shapes',      // Geometric shapes for leagues
    team: 'bottts',        // Robot-like for teams
    user: 'avataaars',     // Human-like for users
  };
  const style = styles[type];
  return `https://api.dicebear.com/7.x/${style}/png?seed=${seed}&size=256`;
}

// Gemini API configuration
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';

// Nano Banana model for image generation
const IMAGE_GENERATION_MODELS = [
  'gemini-2.5-flash-image',        // Nano Banana - fast image generation
];

// Avatar generation prompts based on type
const AVATAR_PROMPTS = {
  league: (name: string) =>
    `Create a simple, minimal logo for an F1 racing league called "${name}". ` +
    `The image MUST be a square that fills the entire canvas edge-to-edge. ` +
    `Do NOT use a circular frame or circular crop — fill the full square. ` +
    `Use only 2-3 bold colors on a solid background. One clean shape or icon — ` +
    `no clutter, no small details. Think app icon simplicity. ` +
    `Flat design, no gradients, no text, no shadows. Works at 64x64 pixels.`,

  team: (name: string) =>
    `Create a simple, minimal badge for an F1 team called "${name}". ` +
    `The image MUST be a square that fills the entire canvas edge-to-edge. ` +
    `Do NOT use a circular frame or circular crop — fill the full square. ` +
    `One bold shape or silhouette on a solid color background. ` +
    `Maximum 2-3 colors, flat design, no fine details or textures. ` +
    `Think of a simple app icon. No text, no gradients, no shadows.`,

  user: (name: string) =>
    `Create a simple, minimal avatar icon for a person named "${name}". ` +
    `The image MUST be a square that fills the entire canvas edge-to-edge. ` +
    `Do NOT use a circular frame or circular crop — fill the full square. ` +
    `One bold geometric shape or abstract face on a solid color background. ` +
    `Maximum 2-3 flat colors. Extremely simple — no details, no texture. ` +
    `Think emoji-level simplicity. No text, no gradients.`,
};

export type AvatarType = 'league' | 'team' | 'user';

interface GenerateAvatarResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * Try to generate image with a specific model using fetch API
 * This avoids Blob/ArrayBuffer issues in React Native
 */
async function tryGenerateWithModel(
  apiKey: string,
  modelName: string,
  prompt: string
): Promise<{ imageData: string; mimeType: string } | null> {
  try {
    console.log(`Trying model: ${modelName}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseModalities: ['image', 'text'],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`Model ${modelName} HTTP error:`, response.status, errorText);
      return null;
    }

    const data = await response.json();

    // Extract image data from response
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts) {
      console.log(`No parts in response from ${modelName}`);
      return null;
    }

    // Find the image part
    const imagePart = candidate.content.parts.find(
      (part: any) => part.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart?.inlineData) {
      console.log(`No image data in response from ${modelName}`);
      return null;
    }

    return {
      imageData: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType || 'image/png',
    };
  } catch (error: any) {
    console.log(`Model ${modelName} failed:`, error.message || error);
    return null;
  }
}

/**
 * Upload base64 image to Firebase Storage using expo-file-system
 * This avoids Blob/ArrayBuffer issues in React Native
 */
async function uploadBase64ToStorage(
  base64Data: string,
  path: string,
  contentType: string
): Promise<string> {
  // Get current user to verify authentication
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to upload avatar');
  }

  // Get file extension from content type
  const extension = contentType.split('/')[1] || 'png';
  const tempFilePath = `${FileSystem.cacheDirectory}avatar_temp_${Date.now()}.${extension}`;

  try {
    // Write base64 data to a temp file
    await FileSystem.writeAsStringAsync(tempFilePath, base64Data, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Temp file written:', tempFilePath);

    // Read the file as a blob using fetch (works with file:// URIs in RN)
    const response = await fetch(tempFilePath);
    const blob = await response.blob();

    console.log('Blob created, size:', blob.size);

    // Create a reference to the file location
    const storageRef = ref(storage, path);

    // Upload using uploadBytesResumable
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType,
    });

    // Wait for upload to complete
    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress.toFixed(0) + '%');
        },
        (error) => {
          console.error('Upload error:', error);
          reject(error);
        },
        () => {
          console.log('Upload complete');
          resolve();
        }
      );
    });

    // Get the download URL
    const downloadUrl = await getDownloadURL(storageRef);

    // Clean up temp file
    await FileSystem.deleteAsync(tempFilePath, { idempotent: true });

    return downloadUrl;
  } catch (error) {
    // Clean up temp file on error
    await FileSystem.deleteAsync(tempFilePath, { idempotent: true }).catch(() => {});
    throw error;
  }
}

/**
 * Generate an avatar image using Google Gemini
 */
export async function generateAvatar(
  name: string,
  type: AvatarType,
  entityId: string
): Promise<GenerateAvatarResult> {
  // If no Gemini API key, use DiceBear placeholder avatars
  if (!GEMINI_API_KEY) {
    console.log('No Gemini API key: using placeholder avatar');
    const imageUrl = generateDemoAvatarUrl(name, type);
    // Save the placeholder URL to the entity
    try {
      await updateEntityAvatar(type, entityId, imageUrl);
    } catch (err) {
      console.log('Could not save avatar URL to entity:', err);
    }
    return { success: true, imageUrl };
  }

  try {
    // Get the appropriate prompt
    const prompt = AVATAR_PROMPTS[type](name);

    // Try each model until one works
    let imageResult: { imageData: string; mimeType: string } | null = null;
    let lastError = '';

    for (const modelName of IMAGE_GENERATION_MODELS) {
      imageResult = await tryGenerateWithModel(GEMINI_API_KEY, modelName, prompt);
      if (imageResult) {
        console.log(`Successfully generated image with model: ${modelName}`);
        break;
      }
    }

    if (!imageResult) {
      return {
        success: false,
        error: `Image generation failed. None of the available models could generate an image. ${lastError}`
      };
    }

    const { imageData, mimeType } = imageResult;

    // Try to upload to Firebase Storage
    try {
      const extension = mimeType.split('/')[1] || 'png';
      const storagePath = `avatars/${type}s/${entityId}.${extension}`;

      const imageUrl = await uploadBase64ToStorage(imageData, storagePath, mimeType);

      // Update the entity with the avatar URL
      await updateEntityAvatar(type, entityId, imageUrl);

      return { success: true, imageUrl };
    } catch (uploadError) {
      // If storage upload fails, fall back to DiceBear placeholder
      console.log('Storage upload failed, using DiceBear fallback:', uploadError);
      const fallbackUrl = generateDemoAvatarUrl(name, type);
      try {
        await updateEntityAvatar(type, entityId, fallbackUrl);
      } catch (err) {
        console.log('Could not save fallback avatar URL:', err);
      }
      return { success: true, imageUrl: fallbackUrl };
    }
  } catch (error) {
    // If Gemini fails, fall back to DiceBear
    console.error('Avatar generation error, using fallback:', error);
    const fallbackUrl = generateDemoAvatarUrl(name, type);
    try {
      await updateEntityAvatar(type, entityId, fallbackUrl);
    } catch (err) {
      console.log('Could not save fallback avatar URL:', err);
    }
    return { success: true, imageUrl: fallbackUrl };
  }
}

/**
 * Update the entity (league/team/user) with the generated avatar URL
 */
async function updateEntityAvatar(
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
 * Check if avatar generation is available
 * Always returns true - we use DiceBear placeholders as fallback when no API key
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
  entityId: string
): Promise<GenerateAvatarResult> {
  // Simply call generateAvatar again - it will overwrite the existing avatar
  return generateAvatar(name, type, entityId);
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
    await updateEntityAvatar(type, entityId, imageUrl);
    return { success: true, imageUrl };
  } catch (error) {
    console.error('Error saving avatar URL:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save avatar',
    };
  }
}
