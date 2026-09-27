/**
 * The outlooks job (F-071): one short text per active driver for the current round, written by
 * the model from the published payload and checked before it is stored. Runs after each
 * projections job. Writes pw_entities/{season}_{round}_{driverId}, which the rules show to pass
 * holders only.
 */
import { DEFAULT_MODEL, generateText } from '../model/llm';
import { buildPrompt, outlookInputs, validateOutlook } from '../model/outlook';

interface DocRef { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(data: Record<string, unknown>, opts?: { merge: boolean }): Promise<unknown> }
export interface OutlookDb { collection(name: string): { doc(id: string): DocRef } }
export interface OutlookOptions { season: string; round: number; apply: boolean; apiKey: string | null; now?: Date; fetchImpl?: typeof fetch; model?: string; limit?: number }
export interface OutlookRun { written: number; refused: number; skipped: number; inputTokens: number; outputTokens: number; refusals: string[] }

export async function runOutlooks(db: OutlookDb, opts: OutlookOptions): Promise<OutlookRun> {
  const run: OutlookRun = { written: 0, refused: 0, skipped: 0, inputTokens: 0, outputTokens: 0, refusals: [] };
  const id = `${opts.season}_${opts.round}`;
  const page = await db.collection('pw_pages').doc(id).get();
  const doc = page.exists ? (page.data() as Record<string, any>) : null;
  if (!doc) { run.skipped += 1; run.refusals.push(`no payload ${id}`); return run; }
  if (!opts.apiKey) { run.skipped += (doc.drivers ?? []).length; run.refusals.push('no model key'); return run; }
  const known: string[] = [...(doc.drivers ?? []).map((d: any) => String(d.name)), ...Object.values(doc.teams ?? {}).map((t: any) => String(t.name))];
  const drivers = (doc.drivers ?? []).slice(0, opts.limit ?? 30);
  for (const d of drivers) {
    const inputs = outlookInputs(doc, d.id);
    if (!inputs) { run.skipped += 1; continue; }
    const prompt = buildPrompt(inputs);
    let text = '', reason: string | null = 'not generated';
    for (let attempt = 0; attempt < 2 && reason; attempt += 1) {
      const user = attempt === 0 ? prompt.user : `${prompt.user}\n\nYour previous answer was refused: ${reason}. Write it again using only the JSON.`;
      const out = await generateText({ system: prompt.system, user, model: opts.model, maxTokens: 220 }, opts.apiKey, opts.fetchImpl);
      run.inputTokens += out.inputTokens; run.outputTokens += out.outputTokens;
      text = out.text; reason = validateOutlook(text, inputs, known);
    }
    if (reason) { run.refused += 1; run.refusals.push(`${d.id}: ${reason}`); continue; }
    if (opts.apply) {
      await db.collection('pw_entities').doc(`${id}_${d.id}`).set({
        season: opts.season, round: opts.round, entityId: d.id, asOf: doc.asOf ?? null,
        outlook: { text, model: opts.model ?? DEFAULT_MODEL, generatedAt: (opts.now ?? new Date()).toISOString(), builtFrom: ['the projection model', 'the price model', 'circuit fit', 'this season\'s classifications', `${inputs.news.length} tagged headline${inputs.news.length === 1 ? '' : 's'}`, inputs.weather.length ? 'the session forecast' : ''].filter(Boolean) },
      }, { merge: true });
    }
    run.written += 1;
  }
  return run;
}
