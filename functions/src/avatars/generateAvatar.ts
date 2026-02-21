import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';

const geminiApiKey = defineSecret('GEMINI_API_KEY');

const IMAGE_GENERATION_MODELS = [
  'gemini-2.5-flash-image',
];

type AvatarType = 'league' | 'team' | 'user';
type AvatarStyle = 'simple' | 'detailed';

const AVATAR_PROMPTS: Record<AvatarStyle, Record<AvatarType, (name: string) => string>> = {
  detailed: {
    league: (name) =>
      `A premium, detailed racing league crest for a Formula 1 fantasy league called "${name}". ` +
      `The imagery should directly represent the meaning or theme of "${name}" — ` +
      `interpret the name literally or metaphorically and make it the central focus. ` +
      `Incorporate motorsport elements like checkered flags, racing stripes, or laurel wreaths around the central imagery. ` +
      `Rich color palette with metallic gold or silver accents on a deep dark background. ` +
      `Highly detailed digital illustration, polished and professional. Square image, edge-to-edge. ` +
      `No text, no words, no letters, no numbers.`,
    team: (name) =>
      `A striking, detailed team emblem for a Formula 1 fantasy team called "${name}". ` +
      `The design must visually represent "${name}" — think about what "${name}" means or evokes ` +
      `and make that the hero element of the badge. ` +
      `Blend the "${name}" concept with motorsport energy: speed lines, carbon fiber textures, or racing livery patterns. ` +
      `Bold, vibrant colors with strong contrast against a dark background. ` +
      `Detailed digital art style, like a professional racing team logo. Square image, edge-to-edge. ` +
      `No text, no words, no letters, no numbers.`,
    user: (name) =>
      `A stylish, detailed avatar portrait inspired by the name "${name}". ` +
      `Create imagery that personally represents "${name}" — interpret the name creatively ` +
      `and build the visual identity around its meaning or vibe. ` +
      `Add subtle racing or F1 motifs like a helmet visor reflection, racing suit collar, or pit lane atmosphere. ` +
      `Cinematic lighting, rich colors, detailed digital illustration on a dark moody background. ` +
      `Square image, edge-to-edge. Not photorealistic. ` +
      `No text, no words, no letters, no numbers.`,
  },
  simple: {
    league: (name) =>
      `A clean, minimalist logo for a racing league called "${name}". ` +
      `Simple flat icon inspired by the name. ` +
      `One or two bold colors on a solid dark background. Minimal detail, geometric shapes. ` +
      `Square image, edge-to-edge. No text, no words, no letters, no numbers.`,
    team: (name) =>
      `A clean, minimalist emblem for a racing team called "${name}". ` +
      `Simple flat icon inspired by the name. ` +
      `One or two bold colors on a solid dark background. Minimal detail, geometric shapes. ` +
      `Square image, edge-to-edge. No text, no words, no letters, no numbers.`,
    user: (name) =>
      `A clean, minimalist avatar inspired by the name "${name}". ` +
      `Simple flat illustration, minimal detail. ` +
      `One or two bold colors on a solid dark background. Geometric or cartoon style. ` +
      `Square image, edge-to-edge. Not photorealistic. No text, no words, no letters, no numbers.`,
  },
};

const COLLECTION_MAP: Record<AvatarType, string> = {
  league: 'leagues',
  team: 'fantasyTeams',
  user: 'users',
};

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

// Rate limit: 1 generation per 30 seconds per user
const RATE_LIMIT_MS = 30_000;

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
 * Verify the caller owns the entity they're generating an avatar for.
 */
async function verifyOwnership(
  userId: string,
  avatarType: AvatarType,
  entityId: string
): Promise<void> {
  const db = admin.firestore();

  if (avatarType === 'user') {
    if (entityId !== userId) {
      throw new HttpsError('permission-denied', 'Cannot generate avatars for other users');
    }
    return;
  }

  if (avatarType === 'team') {
    const teamDoc = await db.collection('fantasyTeams').doc(entityId).get();
    if (!teamDoc.exists) {
      throw new HttpsError('not-found', 'Team not found');
    }
    if (teamDoc.data()?.userId !== userId) {
      throw new HttpsError('permission-denied', 'You do not own this team');
    }
    return;
  }

  if (avatarType === 'league') {
    const leagueDoc = await db.collection('leagues').doc(entityId).get();
    if (!leagueDoc.exists) {
      throw new HttpsError('not-found', 'League not found');
    }
    if (leagueDoc.data()?.ownerId !== userId) {
      throw new HttpsError('permission-denied', 'You do not own this league');
    }
    return;
  }
}

/**
 * Per-user rate limiting via Firestore timestamps.
 */
async function checkRateLimit(userId: string): Promise<void> {
  const db = admin.firestore();
  const rateLimitRef = db.collection('avatarRateLimits').doc(userId);
  const doc = await rateLimitRef.get();

  if (doc.exists) {
    const lastGenerated = doc.data()?.lastGeneratedAt?.toDate();
    if (lastGenerated) {
      const elapsed = Date.now() - lastGenerated.getTime();
      if (elapsed < RATE_LIMIT_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_MS - elapsed) / 1000);
        throw new HttpsError(
          'resource-exhausted',
          `Please wait ${waitSec}s before generating another avatar`
        );
      }
    }
  }

  // Update the timestamp
  await rateLimitRef.set({ lastGeneratedAt: admin.firestore.FieldValue.serverTimestamp() });
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

    const { name, type, entityId, style } = request.data as {
      name?: string;
      type?: string;
      entityId?: string;
      style?: string;
    };

    if (!name || !type || !entityId) {
      throw new HttpsError('invalid-argument', 'name, type, and entityId are required');
    }

    if (!['league', 'team', 'user'].includes(type)) {
      throw new HttpsError('invalid-argument', 'type must be league, team, or user');
    }

    const avatarType = type as AvatarType;
    const avatarStyle: AvatarStyle = style === 'simple' ? 'simple' : 'detailed';
    const userId = request.auth.uid;

    // Verify the caller owns the entity
    await verifyOwnership(userId, avatarType, entityId);

    // Per-user rate limit
    await checkRateLimit(userId);

    const apiKey = geminiApiKey.value();

    if (!apiKey) {
      throw new HttpsError(
        'failed-precondition',
        'GEMINI_API_KEY secret not configured'
      );
    }

    // Generate image with Gemini (try each model)
    const prompt = AVATAR_PROMPTS[avatarStyle][avatarType](name);
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
    const extension = MIME_EXTENSIONS[imageResult.mimeType] || 'png';
    const storagePath = `avatars/${userId}/${avatarType}s/${entityId}.${extension}`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);

    // Generate a download token for the file
    const downloadToken = require('crypto').randomUUID();

    await file.save(imageResult.imageData, {
      metadata: {
        contentType: imageResult.mimeType,
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    // Build a Firebase Storage download URL (no signBlob permission needed)
    const bucketName = bucket.name;
    const encodedPath = encodeURIComponent(storagePath);
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;

    // Update Firestore entity doc
    const collectionName = COLLECTION_MAP[avatarType];
    await admin.firestore().collection(collectionName).doc(entityId).update({
      avatarUrl: downloadUrl,
      avatarGeneratedAt: new Date().toISOString(),
    });

    return { imageUrl: downloadUrl };
  }
);
