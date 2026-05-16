// seedBenLines — model → Firestore ingestion.
//
// Reads a CSV produced by Ben's predictor (the_quali_model.py, the_gp_model.py,
// or predicted_scores.py — see /mnt/smb/f1-app/model/MODELS.md) and writes
// ben_lines/{raceId}_{session} docs.
//
// CSV shape (one row per (entity, session)):
//
//   entityId,entityKind,session,line,withOdds,againstOdds
//   ver,driver,race,3.5,1.91,1.91
//   ver,driver,qualifying,2.5,1.91,1.91
//   red_bull,constructor,race,12.5,1.95,1.85
//   ...
//
// Usage:
//   cd newgame/functions
//   npx ts-node scripts/seedBenLines.ts \
//     --race=2026_R07_canada \
//     --csv=/tmp/canada-lines.csv \
//     [--project=f1-app-18077]
//
// The script uses application-default credentials. If the local
// firebase-admin SDK can't find ADC, run:
//   gcloud auth application-default login
// or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key JSON file.

import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';

type SessionKey = 'qualifying' | 'race' | 'sprint';

interface ParsedRow {
  entityId: string;
  entityKind: 'driver' | 'constructor';
  session: SessionKey;
  line: number;
  withOdds: number;
  againstOdds: number;
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const need = ['entityId', 'entityKind', 'session', 'line', 'withOdds', 'againstOdds'];
  for (const h of need) {
    if (!header.includes(h)) throw new Error(`CSV missing column: ${h}`);
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    rows.push({
      entityId: cells[idx.entityId],
      entityKind: cells[idx.entityKind] as 'driver' | 'constructor',
      session: cells[idx.session] as SessionKey,
      line: Number(cells[idx.line]),
      withOdds: Number(cells[idx.withOdds]),
      againstOdds: Number(cells[idx.againstOdds]),
    });
  }
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const raceId = args.race;
  const csvPath = args.csv;
  const projectId = args.project ?? 'f1-app-18077';
  if (!raceId || !csvPath) {
    console.error('Usage: ts-node seedBenLines.ts --race=<raceId> --csv=<path> [--project=<id>]');
    process.exit(1);
  }

  const text = fs.readFileSync(path.resolve(csvPath), 'utf8');
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} rows from ${csvPath}`);

  // Group rows by session.
  const bySession: Record<SessionKey, ParsedRow[]> = { qualifying: [], race: [], sprint: [] };
  for (const r of rows) {
    if (!bySession[r.session]) {
      console.warn(`Unknown session "${r.session}" on ${r.entityId} — skipping`);
      continue;
    }
    bySession[r.session].push(r);
  }

  // Init admin SDK with ADC.
  if (admin.apps.length === 0) {
    admin.initializeApp({ projectId });
  }
  const db = admin.firestore();

  for (const session of Object.keys(bySession) as SessionKey[]) {
    const sessionRows = bySession[session];
    if (sessionRows.length === 0) continue;
    const entities: Record<string, ParsedRow> = {};
    for (const r of sessionRows) {
      entities[r.entityId] = r;
    }
    const docId = `${raceId}_${session}`;
    await db.doc(`ben_lines/${docId}`).set(
      {
        raceId,
        session,
        entities,
        posted: true,
        postedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`Wrote ben_lines/${docId} (${Object.keys(entities).length} entities)`);
  }

  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
