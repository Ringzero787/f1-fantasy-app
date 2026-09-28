/**
 * The outlooks job (F-071): one short text per active driver for the current round, written by a
 * model from the published payload and checked before it is stored. Runs after each projections
 * job. Writes pw_entities/{season}_{round}_{driverId}, which the rules show to pass holders only.
 *
 * Three things keep a bad run from being expensive. It resumes: a driver already written for this
 * payload is left alone, so the retries a failed job attracts do not pay for the same text five
 * times. One driver's failure is that driver's failure: the call is guarded, the run carries on,
 * and the counters still come back. And it stops — on a token ceiling and on a wall clock — because
 * this job holds the single worker slot while it runs.
 */
import { DEFAULT_MODEL, generateText, type Llm, type LlmDeps } from '../model/llm';
import { buildPrompt, outlookInputs, validateOutlook } from '../model/outlook';

interface DocRef { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(data: Record<string, unknown>, opts?: { merge: boolean }): Promise<unknown> }
export interface OutlookDb { collection(name: string): { doc(id: string): DocRef } }

export interface OutlookOptions {
  season: string;
  round: number;
  apply: boolean;
  /** which door to the model, or null when none is configured */
  llm: Llm | null;
  /** the kill switch: nothing is generated when false */
  enabled?: boolean;
  /** drivers per run, at most */
  limit?: number;
  /** tokens (in + out, cache included) a run may spend before it stops generating */
  maxTokens?: number;
  /** wall clock a run may take before it stops, so it cannot hold the worker all afternoon */
  deadlineMs?: number;
  model?: string;
  now?: Date;
  deps?: LlmDeps;
}
export interface OutlookRun { written: number; refused: number; skipped: number; failed: number; inputTokens: number; outputTokens: number; refusals: string[] }

export const DEFAULT_MAX_TOKENS_PER_RUN = 900_000;
export const DEFAULT_DEADLINE_MS = 20 * 60 * 1000;
/**
 * The drivers worth writing about. The payload is sorted by projection, so this is the top of the
 * board — where a reader's attention is, and the only place the prose earns its cost.
 */
export const DEFAULT_LIMIT = 12;

export async function runOutlooks(db: OutlookDb, opts: OutlookOptions): Promise<OutlookRun> {
  const run: OutlookRun = { written: 0, refused: 0, skipped: 0, failed: 0, inputTokens: 0, outputTokens: 0, refusals: [] };
  const note = (why: string) => { if (!run.refusals.includes(why)) run.refusals.push(why); };
  const id = `${opts.season}_${opts.round}`;
  const page = await db.collection('pw_pages').doc(id).get();
  const doc = page.exists ? (page.data() as Record<string, any>) : null;
  if (!doc) { run.skipped += 1; note(`no payload ${id}`); return run; }
  const drivers = (doc.drivers ?? []).slice(0, opts.limit ?? DEFAULT_LIMIT);
  if (opts.enabled === false) { run.skipped += drivers.length; note('outlooks switched off'); return run; }
  if (!opts.llm) { run.skipped += drivers.length; note('no model configured'); return run; }

  const ceiling = opts.maxTokens ?? DEFAULT_MAX_TOKENS_PER_RUN;
  // Wall clock from the moment the run starts — not from `opts.now`, which is the stamp that goes
  // on the documents and may be any time at all.
  const startedAt = Date.now();
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const known: string[] = [...(doc.drivers ?? []).map((d: any) => String(d.name)), ...Object.values(doc.teams ?? {}).map((t: any) => String(t.name))];

  for (const d of drivers) {
    if (run.inputTokens + run.outputTokens >= ceiling) { run.skipped += 1; note('token ceiling reached'); continue; }
    if (Date.now() - startedAt > deadlineMs) { run.skipped += 1; note('out of time'); continue; }
    const inputs = outlookInputs(doc, d.id);
    if (!inputs) { run.skipped += 1; continue; }

    const ref = db.collection('pw_entities').doc(`${id}_${d.id}`);
    try {
      // Written already for this very payload: the retries a failed job attracts must not pay twice.
      const existing = await ref.get();
      if (existing.exists && (existing.data() as Record<string, any> | undefined)?.asOf === doc.asOf && (existing.data() as Record<string, any> | undefined)?.outlook?.text) { run.skipped += 1; continue; }

      const prompt = buildPrompt(inputs);
      let text = '', reason: string | null = 'not generated';
      for (let attempt = 0; attempt < 2 && reason; attempt += 1) {
        const user = attempt === 0 ? prompt.user : `${prompt.user}\n\nYour previous answer was refused: ${reason}. Write it again using only the JSON.`;
        const out = await generateText({ system: prompt.system, user, model: opts.model, maxTokens: 220 }, opts.llm, opts.deps);
        run.inputTokens += out.inputTokens; run.outputTokens += out.outputTokens;
        text = out.text; reason = validateOutlook(text, inputs, known);
      }
      if (reason) { run.refused += 1; run.refusals.push(`${d.id}: ${reason}`); continue; }
      if (opts.apply) {
        await ref.set({
          season: opts.season, round: opts.round, entityId: d.id, asOf: doc.asOf ?? null,
          outlook: {
            text, model: opts.model ?? DEFAULT_MODEL, generatedAt: (opts.now ?? new Date()).toISOString(),
            builtFrom: ['the projection model', 'the price model', 'circuit fit', "this season's classifications", `${inputs.news.length} tagged headline${inputs.news.length === 1 ? '' : 's'}`, inputs.weather.length ? 'the session forecast' : ''].filter(Boolean),
          },
        }, { merge: true });
      }
      run.written += 1;
    } catch (e) {
      // One driver's bad luck is one driver's: the rest of the grid still gets written, and the
      // counters come back so the run record says what happened.
      run.failed += 1;
      run.refusals.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return run;
}
