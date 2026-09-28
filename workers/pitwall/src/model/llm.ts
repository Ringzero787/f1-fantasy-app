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
/** Everything that could touch this machine, the network or the service account. */
export const DENIED_TOOLS = ['Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'TodoWrite'];
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
    // One question, not a session. `--allowed-tools` is an AUTO-APPROVE list, not a restriction, so
    // the tools are named on the deny side; `--setting-sources ''` keeps the operator's settings,
    // hooks and plugins out of a process that is being fed news headlines. Without them the agent
    // runtime's prompt is a third of the size, so this is cheaper as well as tighter.
    '--system-prompt', req.system, '--setting-sources', '', '--strict-mcp-config', '--permission-prompts', 'none',
    '--disallowed-tools', ...DENIED_TOOLS];
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

/** Enough for any answer; a runaway child must not take the worker's heap with it. */
const MAX_OUTPUT = 2_000_000;

const runCli: RunCli = (bin, args, stdin, timeoutMs) => new Promise((resolve, reject) => {
  // Its own process group, so the timeout kills the CLI's children too rather than orphaning them.
  const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  let stdout = '', stderr = '', settled = false;
  const stop = () => { try { process.kill(-(child.pid ?? 0), 'SIGKILL'); } catch { child.kill('SIGKILL'); } };
  const timer = setTimeout(() => { settled = true; stop(); reject(new Error(`model call failed: claude did not answer within ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
  child.stdout.on('data', (d) => { if (stdout.length < MAX_OUTPUT) stdout += String(d); else if (!settled) { settled = true; clearTimeout(timer); stop(); reject(new Error('model call failed: the CLI would not stop talking')); } });
  child.stderr.on('data', (d) => { if (stderr.length < 8192) stderr += String(d); });
  child.on('error', (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error(`model call failed: ${e.message}`)); });
  child.on('close', (code) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ code: code ?? 0, stdout, stderr }); });
  child.stdin.on('error', () => undefined);   // a child that dies early must not take the process with it
  child.stdin.end(stdin);
});
