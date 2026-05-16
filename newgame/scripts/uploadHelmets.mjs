// Upload background-removed helmets to Firebase Storage with public read.
// Outputs a JSON map of {helmetId: publicUrl} which we then paste into
// cosmeticsCatalog.ts.

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SA_KEY = '/data/f1-app/scripts/serviceAccountKey.json';
const BUCKET = 'f1-app-18077.firebasestorage.app';
const SRC_DIR = '/tmp/tl-helmets-clean';

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(SA_KEY, 'utf-8'))),
  storageBucket: BUCKET,
});
const bucket = admin.storage().bucket();

const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.png'));
const out = {};
for (const f of files) {
  const id = f.replace('.png', '');
  const dest = `cosmetics/helmets/${f}`;
  const file = bucket.file(dest);
  await bucket.upload(join(SRC_DIR, f), {
    destination: dest,
    metadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  await file.makePublic();
  out[id] = `https://storage.googleapis.com/${BUCKET}/${dest}`;
  console.log(`uploaded ${f} -> ${out[id]}`);
}
console.log('\nURLs map:');
console.log(JSON.stringify(out, null, 2));
