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

// Nano Banana model for image generation (with fallback)
const IMAGE_GENERATION_MODELS = [
  'gemini-2.0-flash-exp',           // Stable model with image output
  'gemini-2.5-flash-image',         // Nano Banana - fast image generation
];

// Avatar generation prompts based on type — uses name for thematic imagery
const AVATAR_PROMPTS = {
  league: (name: string) =>
    `A simple, clean racing emblem inspired by the name "${name}". ` +
    `One bold icon in the center that represents "${name}". ` +
    `Flat graphic style, solid dark background, 2-3 colors max. Square image, edge-to-edge. ` +
    `No text, no words, no letters.`,

  team: (name: string) =>
    `A simple, bold team badge for a racing team called "${name}". ` +
    `One strong central symbol that represents "${name}". ` +
    `Flat graphic style, solid dark background, 2-3 accent colors. ` +
    `Square image, edge-to-edge. No text, no words, no letters.`,

  user: (name: string) =>
    `A stylized racing avatar inspired by the name "${name}". ` +
    `Simple, bold imagery that evokes "${name}" on a solid dark background. ` +
    `Flat illustrated style, not photorealistic. Square image, edge-to-edge. ` +
    `No text, no words, no letters.`,
};

export type AvatarType = 'league' | 'team' | 'user';

interface GenerateAvatarResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * Fetch with a timeout — React Native fetch has no built-in timeout
 */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    fetch(url, { ...options, signal: controller.signal })
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

/**
 * Try to generate image with a specific model using fetch API
 * Returns the image data or throws with a descriptive error
 */
async function tryGenerateWithModel(
  apiKey: string,
  modelName: string,
  prompt: string
): Promise<{ imageData: string; mimeType: string }> {
  console.log(`Trying model: ${modelName}`);

  const response = await fetchWithTimeout(
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
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    },
    90_000 // 90 second timeout — image generation can be slow
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();

  // Extract image data from response
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = data.candidates?.[0]?.finishReason || 'no parts in response';
    throw new Error(`Model returned no content (${reason})`);
  }

  // Find the image part
  const imagePart = candidate.content.parts.find(
    (part: any) => part.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart?.inlineData) {
    const partTypes = candidate.content.parts.map((p: any) =>
      p.text ? 'text' : p.inlineData ? p.inlineData.mimeType : 'unknown'
    );
    throw new Error(`No image in response, got: [${partTypes.join(', ')}]`);
  }

  return {
    imageData: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  };
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
    const errors: string[] = [];

    for (const modelName of IMAGE_GENERATION_MODELS) {
      try {
        imageResult = await tryGenerateWithModel(GEMINI_API_KEY, modelName, prompt);
        console.log(`Successfully generated image with model: ${modelName}`);
        break;
      } catch (err: any) {
        const msg = `${modelName}: ${err.message || err}`;
        console.log(`Model failed — ${msg}`);
        errors.push(msg);
      }
    }

    if (!imageResult) {
      return {
        success: false,
        error: `Image generation failed.\n${errors.join('\n')}`,
      };
    }

    const { imageData, mimeType } = imageResult;

    // Try to upload to Firebase Storage
    try {
      const extension = mimeType.split('/')[1] || 'png';
      const userId = firebaseAuth.currentUser?.uid;
      if (!userId) {
        return { success: false, error: 'Must be authenticated to upload avatars' };
      }
      const storagePath = `avatars/${userId}/${type}s/${entityId}.${extension}`;

      const imageUrl = await uploadBase64ToStorage(imageData, storagePath, mimeType);

      // Update the entity with the avatar URL
      await updateEntityAvatar(type, entityId, imageUrl);

      return { success: true, imageUrl };
    } catch (uploadError: any) {
      // If storage upload fails, report the error so user knows what happened
      console.error('Storage upload failed:', uploadError);
      return {
        success: false,
        error: `Upload failed: ${uploadError.message || uploadError}`,
      };
    }
  } catch (error: any) {
    console.error('Avatar generation error:', error);
    return {
      success: false,
      error: `Generation failed: ${error.message || error}`,
    };
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
