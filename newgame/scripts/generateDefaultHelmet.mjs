// One-shot generator for the default Track Limits brand helmet
// (the free Foundation pack helmet given to every new player).

import { writeFile } from 'fs/promises';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }

const MODEL = 'gemini-2.5-flash-image';
const PROMPT =
  `A stylized racing helmet illustration, 3/4 view, just the helmet object — no driver, no head, no body. ` +
  `Centered on a clean white seamless background. Detailed digital illustration, clean composition, ` +
  `suitable for use as a fantasy racing game default avatar. ` +
  `Pure white base color with a single thin electric blue accent stripe down the center, ` +
  `visor in dark tinted blue-black, modern minimalist clean design, polished but not photorealistic. ` +
  `No logos, no text, no words, no numbers, no real-world brand markings.`;

const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
  }),
});
if (!res.ok) {
  console.error('failed:', res.status, await res.text());
  process.exit(1);
}
const data = await res.json();
const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
if (!part) { console.error('no image'); process.exit(1); }
const buf = Buffer.from(part.inlineData.data, 'base64');
await writeFile('/mnt/smb/share/tracklimits-cosmetic-previews/helmets/track_limits_classic.png', buf);
console.log('wrote track_limits_classic.png');
