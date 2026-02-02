import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db, firebaseAuth } from '../config/firebase';
import { useAuthStore } from '../store/auth.store';

// Firebase Storage bucket name from environment
const STORAGE_BUCKET = process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '';

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
    `Create a modern, stylized logo/emblem for a fantasy F1 racing league called "${name}". ` +
    `The design should be sporty and professional, featuring racing elements like checkered flags, ` +
    `speed lines, or racing helmets. Use bold colors and clean geometric shapes. ` +
    `The image should work well as a small circular or rounded square avatar. ` +
    `Style: flat design, vector-like, modern sports branding. No text in the image.`,

  team: (name: string) =>
    `Create a modern team badge/crest for a fantasy F1 team called "${name}". ` +
    `The design should be dynamic and sporty, incorporating racing themes like ` +
    `tires, wings, speed effects, or abstract car silhouettes. ` +
    `Use vibrant colors that pop. The image should work as a small avatar. ` +
    `Style: modern esports team logo, clean and bold. No text in the image.`,

  user: (name: string) =>
    `Create a stylized avatar portrait for a racing fan named "${name}". ` +
    `The design should be a cool, abstract representation - not a realistic face. ` +
    `Use racing helmet visor reflections, speed lines, or geometric patterns. ` +
    `Modern and sleek. Works well as a small circular profile picture. ` +
    `Style: abstract digital art, racing aesthetic. No text.`,
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
 * Upload base64 image to Firebase Storage using REST API
 * This avoids Blob/ArrayBuffer issues in React Native
 */
async function uploadBase64ToStorage(
  base64Data: string,
  path: string,
  contentType: string
): Promise<string> {
  // Get current user's auth token for authenticated upload
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to upload avatar');
  }

  const token = await user.getIdToken();

  // Encode the path for the URL
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

/**
 * Generate an avatar image using Google Gemini
 */
export async function generateAvatar(
  name: string,
  type: AvatarType,
  entityId: string
): Promise<GenerateAvatarResult> {
  // Check if in demo mode - use placeholder avatar instead of AI generation
  const isDemoMode = useAuthStore.getState().isDemoMode;

  if (isDemoMode) {
    console.log('Demo mode: using placeholder avatar');
    const imageUrl = generateDemoAvatarUrl(name, type);
    return { success: true, imageUrl };
  }

  if (!GEMINI_API_KEY) {
    return {
      success: false,
      error: 'Gemini API key not configured. Set EXPO_PUBLIC_GEMINI_API_KEY in your environment.'
    };
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

    // Upload to Firebase Storage using REST API (React Native compatible - avoids Blob issues)
    const extension = mimeType.split('/')[1] || 'png';
    const storagePath = `avatars/${type}s/${entityId}.${extension}`;

    const imageUrl = await uploadBase64ToStorage(imageData, storagePath, mimeType);

    // Update the entity with the avatar URL
    await updateEntityAvatar(type, entityId, imageUrl);

    return { success: true, imageUrl };
  } catch (error) {
    console.error('Avatar generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate avatar'
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
 * Check if avatar generation is available (API key configured)
 */
export function isAvatarGenerationAvailable(): boolean {
  // Available in demo mode (uses placeholder) or when API key is configured
  const isDemoMode = useAuthStore.getState().isDemoMode;
  return isDemoMode || !!GEMINI_API_KEY;
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
