// One-shot helmet livery generator for Track Limits cosmetic previews.
// Calls Gemini 2.5 Flash Image, saves PNGs to the SMB share, builds an HTML
// index so the user can review all candidates side-by-side before any pack
// gets shipped to users.
//
// Run: GEMINI_API_KEY=... node scripts/generateHelmetPreviews.mjs

import { writeFile } from 'fs/promises';
import { join } from 'path';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('GEMINI_API_KEY not set');
  process.exit(1);
}

const OUT_DIR = '/mnt/smb/share/tracklimits-cosmetic-previews/helmets';
const MODEL = 'gemini-2.5-flash-image';

const BASE_PROMPT = (livery) =>
  `A stylized racing helmet illustration, 3/4 view, just the helmet object — no driver, no head, no body. ` +
  `Centered on a clean white seamless background. Detailed digital illustration, clean composition, ` +
  `suitable for use as a fantasy racing game cosmetic. ${livery}. ` +
  `No logos, no text, no words, no numbers, no real-world brand markings. ` +
  `Crisp edges, polished but stylized, not photorealistic.`;

const LIVERIES = [
  { id: 'monaco_gold', name: 'Monaco Gold', desc: 'matte gold base with white pinstripes and royal blue accent on the visor frame, evoking Monaco harbor royalty' },
  { id: 'vegas_neon', name: 'Vegas Neon', desc: 'matte black base with electric pink and cyan neon accent stripes flowing diagonally, late-night strip aesthetic' },
  { id: 'suzuka_blossom', name: 'Suzuka Blossom', desc: 'soft pastel pink base with scattered cherry blossom petal motifs across the top, white visor frame' },
  { id: 'brazil_tribute', name: 'Brazil Tribute', desc: 'vibrant yellow base with diagonal blue and green stripes meeting at the crown, evoking Brazilian flag colors, no logos' },
  { id: 'senna_era', name: 'Senna Era', desc: 'vibrant canary yellow base with a single bold blue stripe down the center, retro early-90s motorsport aesthetic' },
  { id: 'carbon_weave', name: 'Carbon Weave', desc: 'matte carbon-fiber black base with subtle iridescent purple-blue oil-slick highlights, modern minimalist hybrid era' },
  { id: 'hybrid_silver', name: 'Hybrid Silver', desc: 'metallic silver chrome base with red angular accents, futuristic geometric panel pattern' },
  { id: 'holographic', name: 'Holographic', desc: 'iridescent shimmering rainbow pearl finish, light refraction effect, premium feel' },
  { id: 'imola_crimson', name: 'Imola Crimson', desc: 'deep red base with cream white stripe down the center, classic European racing heritage style' },
  { id: 'spa_forest', name: 'Spa Forest', desc: 'deep forest green base with silver accents, subtle pine forest silhouette on the side panel, Belgian classic' },
  { id: 'champion_gold', name: 'Champion Gold', desc: 'champagne gold base with subtle laurel wreath motif at the rear, premium podium finisher feel' },
  { id: 'midnight_strip', name: 'Midnight Strip', desc: 'midnight blue-black base with single thin gold stripe and a faint star-glitter accent on the rear quarter' },
];

async function generateOne(livery) {
  const prompt = BASE_PROMPT(livery.desc);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imagePart?.inlineData?.data) {
    throw new Error(`No image in response for ${livery.id}: ${JSON.stringify(candidate?.finishReason ?? 'unknown')}`);
  }
  const buf = Buffer.from(imagePart.inlineData.data, 'base64');
  const ext = imagePart.inlineData.mimeType === 'image/png' ? 'png' : imagePart.inlineData.mimeType === 'image/webp' ? 'webp' : 'jpg';
  const filename = `${livery.id}.${ext}`;
  await writeFile(join(OUT_DIR, filename), buf);
  return { ...livery, filename, mimeType: imagePart.inlineData.mimeType };
}

async function main() {
  console.log(`Generating ${LIVERIES.length} helmet candidates...`);
  const results = [];
  for (const l of LIVERIES) {
    process.stdout.write(`  ${l.id} ... `);
    try {
      const r = await generateOne(l);
      console.log('ok');
      results.push(r);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      results.push({ ...l, filename: null, error: err.message });
    }
  }

  // HTML index
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Track Limits helmet previews</title>
<style>
  body { background: #0D1117; color: #F0F6FC; font: 15px -apple-system, BlinkMacSystemFont, sans-serif; padding: 32px; }
  h1 { font-size: 28px; margin-bottom: 8px; }
  .sub { color: #8B949E; margin-bottom: 32px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .card { background: #161B22; border: 1px solid #30363D; border-radius: 12px; padding: 16px; }
  .card img { display: block; width: 100%; aspect-ratio: 1; object-fit: contain; background: #fff; border-radius: 8px; }
  .card h2 { font-size: 16px; font-weight: 700; margin: 12px 0 4px; }
  .card p { font-size: 12px; color: #8B949E; line-height: 1.5; }
  .card.error { border-color: #F85149; }
  .card.error p { color: #F85149; }
</style>
</head>
<body>
<h1>Track Limits — helmet livery previews</h1>
<p class="sub">${results.length} candidates generated via Gemini 2.5 Flash Image. Pick the ones worth shipping; we'll bundle them into packs.</p>
<div class="grid">
${results
  .map((r) =>
    r.filename
      ? `  <div class="card">
    <img src="helmets/${r.filename}" alt="${r.name}" />
    <h2>${r.name}</h2>
    <p>${r.desc}</p>
  </div>`
      : `  <div class="card error">
    <h2>${r.name}</h2>
    <p>FAILED: ${r.error}</p>
  </div>`
  )
  .join('\n')}
</div>
</body>
</html>`;

  await writeFile('/mnt/smb/share/tracklimits-cosmetic-previews/index.html', html);
  console.log(`\nDone. Open /mnt/smb/share/tracklimits-cosmetic-previews/index.html to review.`);
  console.log(`(${results.filter((r) => r.filename).length} success, ${results.filter((r) => !r.filename).length} failed)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
