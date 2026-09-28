/**
 * The one door to a language model (F-071). Two backends behind one call:
 *
 *   `cli` — the Claude Code CLI on this machine, on the studio's own subscription. No key to hold,
 *           rotate or cap, and the default: this is a one-person studio whose box already has a
 *           session, and a metered account for a feature that runs a few times a weekend was one
 *           spending limit too many (ADR-003 records the same reasoning for the gates).
 *   `api`  — the Anthropic Messages API with a key, for a runner that has no CLI session. The GCP
 *           backup would need this.
 *
 * The CLI carries its own runtime prompt, so one call costs far more input tokens than the API
 * would for the same question. That is the price of not holding a second account, and it is why
 * the caller's token ceiling counts cache tokens too: the ceiling is about the subscription's
 * limits, not about a bill.
 */
import { spawn } from 'node:child_process';

export interface LlmRequest { system: string; user: string; model?: string; maxTokens?: number }
export interface LlmResult { text: string; inputTokens: number; outputTokens: number; model: string }

/** Which door to use. `bin` defaults to whatever `claude` resolves to on PATH. */
export type Llm = { kind: 'api'; apiKey: string } | { kind: 'cli'; bin?: string };

export const DEFAULT_MODEL = 'claude-sonnet-5';
export const CLI_TIMEOUT_MS = 180_000;
export const API_TIMEOUT_MS = 45_000;

/** Spawning the CLI, injectable so the job can be tested without one. */
export type RunCli = (bin: string, args: string[], stdin: string, timeoutMs: number) => Promise<{ code: number; stdout: string; stderr: string }>;
export interface LlmDeps { fetchImpl?: typeof fetch; run?: RunCli }

export async function generateText(req: LlmRequest, llm: Llm, deps: LlmDeps = {}): Promise<LlmResult> {
  return llm.kind === 'cli' ? viaCli(req, llm, deps) : viaApi(req, llm, deps);
}

/** The prompt goes in on stdin, never on the command line, where it would be visible in `ps`. */
async function viaCli(req: LlmRequest, llm: { bin?: string }, deps: LlmDeps): Promise<LlmResult> {
  const model = req.model ?? DEFAULT_MODEL;
  const run = deps.run ?? runCli;
  const args = ['-p', '--output-format', 'json', '--model', model,
    // our own system prompt instead of the agent's, and no tools: this is one question, not a session
    '--system-prompt', req.system, '--allowed-tools', '', '--exclude-dynamic-system-prompt-sections'];
  const { code, stdout, stderr } = await run(llm.bin ?? 'claude', args, req.user, CLI_TIMEOUT_MS);
  if (code !== 0) throw new Error(`model call failed: claude exited ${code}${stderr ? ` — ${stderr.trim().slice(0, 200)}` : ''}`);
  let body: Record<string, any>;
  try { body = JSON.parse(stdout) as Record<string, any>; } catch { throw new Error(`model call failed: unreadable CLI output — ${stdout.slice(0, 200)}`); }
  if (body.is_error) throw new Error(`model call failed: ${String(body.result ?? body.subtype ?? 'error').slice(0, 200)}`);
  const u = (body.usage ?? {}) as Record<string, number>;
  return {
    text: String(body.result ?? '').trim(),
    // cache creation and reads are what the runtime prompt costs, and they count against the limits
    inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    outputTokens: u.output_tokens ?? 0,
    model,
  };
}

async function viaApi(req: LlmRequest, llm: { apiKey: string }, deps: LlmDeps): Promise<LlmResult> {
  const model = req.model ?? DEFAULT_MODEL;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': llm.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: req.maxTokens ?? 300, system: req.system, messages: [{ role: 'user', content: req.user }] }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`model call failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, model };
}

const runCli: RunCli = (bin, args, stdin, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', settled = false;
  const timer = setTimeout(() => { settled = true; child.kill('SIGKILL'); reject(new Error(`model call failed: claude did not answer within ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
  child.stdout.on('data', (d) => { stdout += String(d); });
  child.stderr.on('data', (d) => { stderr += String(d); });
  child.on('error', (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error(`model call failed: ${e.message}`)); });
  child.on('close', (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  child.stdin.on('error', () => undefined);   // a child that dies early must not take the process with it
  child.stdin.end(stdin);
});
