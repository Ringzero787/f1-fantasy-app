import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const IMAGE_GENERATION_MODELS = [
  'gemini-2.0-flash-exp',
  'gemini-2.5-flash-image',
];

type AvatarType = 'league' | 'team' | 'user';

const AVATAR_PROMPTS: Record<AvatarType, (name: string) => string> = {
  league: (name) =>
    `A simple, clean racing emblem inspired by the name "${name}". ` +
    `One bold icon in the center that represents "${name}". ` +
    `Flat graphic style, solid dark background, 2-3 colors max. Square image, edge-to-edge. ` +
    `No text, no words, no letters.`,
  team: (name) =>
    `A simple, bold team badge for a racing team called "${name}". ` +
    `One strong central symbol that represents "${name}". ` +
    `Flat graphic style, solid dark background, 2-3 accent colors. ` +
    `Square image, edge-to-edge. No text, no words, no letters.`,
  user: (name) =>
    `A stylized racing avatar inspired by the name "${name}". ` +
    `Simple, bold imagery that evokes "${name}" on a solid dark background. ` +
    `Flat illustrated style, not photorealistic. Square image, edge-to-edge. ` +
    `No text, no words, no letters.`,
};

const COLLECTION_MAP: Record<AvatarType, string> = {
  league: 'leagues',
  team: 'fantasyTeams',
  user: 'users',
};

async function tryGenerateWithModel(
  apiKey: string,
  modelName: string,
  prompt: string
): Promise<{ imageData: Buffer; mimeType: string }> {
  console.log(`Trying model: ${modelName}`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = candidate?.finishReason || 'no parts in response';
    throw new Error(`Model returned no content (${reason})`);
  }

  const imagePart = candidate.content.parts.find(
    (part: any) => part.inlineData?.mimeType?.startsWith('image/')
  );

  if (!imagePart?.inlineData) {
    throw new Error('No image in response');
  }

  return {
    imageData: Buffer.from(imagePart.inlineData.data, 'base64'),
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  };
}

/**
 * Cloud Function: generate an AI avatar via Gemini, upload to Storage,
 * update the Firestore entity doc with the avatarUrl.
 *
 * Called from client via httpsCallable('generateAvatarFn').
 */
export const generateAvatarFn = onCall(
  {
    timeoutSeconds: 120,
    memory: '512MiB',
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated');
    }

    // App Check Phase 1: warn only
    if (!request.app) {
      console.warn(
        `[AppCheck] generateAvatarFn called without App Check token. uid=${request.auth.uid}`
      );
    }

    const { name, type, entityId } = request.data as {
      name?: string;
      type?: string;
      entityId?: string;
    };

    if (!name || !type || !entityId) {
      throw new HttpsError('invalid-argument', 'name, type, and entityId are required');
    }

    if (!['league', 'team', 'user'].includes(type)) {
      throw new HttpsError('invalid-argument', 'type must be league, team, or user');
    }

    const avatarType = type as AvatarType;
    const userId = request.auth.uid;
    const apiKey = geminiApiKey.value();

    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'GEMINI_API_KEY secret not configured'
      );
    }

    // Generate image with Gemini (try each model)
    const prompt = AVATAR_PROMPTS[avatarType](name);
    let imageResult: { imageData: Buffer; mimeType: string } | null = null;
    const errors: string[] = [];

    for (const modelName of IMAGE_GENERATION_MODELS) {
      try {
        imageResult = await tryGenerateWithModel(apiKey, modelName, prompt);
        console.log(`Generated image with model: ${modelName}`);
        break;
      } catch (err: any) {
        const msg = `${modelName}: ${err.message || err}`;
        console.log(`Model failed: ${msg}`);
        errors.push(msg);
      }
    }

    if (!imageResult) {
      throw new HttpsError(
        'internal',
        `Image generation failed.\n${errors.join('\n')}`
      );
    }

    // Upload to Firebase Storage via Admin SDK
    const extension = imageResult.mimeType.split('/')[1] || 'png';
    const storagePath = `avatars/${userId}/${avatarType}s/${entityId}.${extension}`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);

    await file.save(imageResult.imageData, {
      metadata: { contentType: imageResult.mimeType },
    });

    // Make file publicly accessible and get download URL
    // Generate a signed URL that lasts 10 years (effectively permanent)
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: '2036-01-01',
    });

    // Update Firestore entity doc
    const collectionName = COLLECTION_MAP[avatarType];
    await admin.firestore().collection(collectionName).doc(entityId).update({
      avatarUrl: signedUrl,
      avatarGeneratedAt: new Date().toISOString(),
    });

    return { imageUrl: signedUrl };
  }
);
