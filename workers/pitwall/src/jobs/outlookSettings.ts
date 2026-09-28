/**
 * How the worker's environment chooses a model door and the brakes on it (F-071). Pure, so the
 * flags that stand between us and an unbounded model bill are covered by a test rather than by
 * hope.
 *
 *   PW_OUTLOOKS=off             nothing is generated at all
 *   PW_LLM=cli|api              which door; cli is the default and needs no key
 *   PW_CLAUDE_BIN=/path/claude  the CLI, when it is not on PATH
 *   ANTHROPIC_API_KEY=…         required by, and only by, PW_LLM=api
 *   PW_OUTLOOK_MAX_TOKENS=n     tokens per run, cache included; 0 really means 0
 *   PW_OUTLOOK_DEADLINE_MS=n    wall clock per run
 *   PW_OUTLOOK_LIMIT=n          drivers per run
 */
import type { Llm } from '../model/llm';

export interface OutlookSettings { llm: Llm | null; enabled: boolean; maxTokens?: number; deadlineMs?: number; limit?: number }

/** A number from the environment, where "0" is a value and not an absence. */
export const numberOf = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

export function outlookSettings(env: Record<string, string | undefined>): OutlookSettings {
  const enabled = env.PW_OUTLOOKS !== 'off';
  const wantsApi = (env.PW_LLM ?? 'cli').toLowerCase() === 'api';
  const key = env.ANTHROPIC_API_KEY?.trim();
  const llm: Llm | null = wantsApi
    ? (key ? { kind: 'api', apiKey: key } : null)
    : { kind: 'cli', bin: env.PW_CLAUDE_BIN?.trim() || undefined };
  return { llm, enabled, maxTokens: numberOf(env.PW_OUTLOOK_MAX_TOKENS), deadlineMs: numberOf(env.PW_OUTLOOK_DEADLINE_MS), limit: numberOf(env.PW_OUTLOOK_LIMIT) };
}
