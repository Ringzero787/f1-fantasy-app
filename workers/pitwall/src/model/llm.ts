/**
 * The one door to a language model (F-071). Anthropic Messages API over fetch; the key comes
 * from the environment on forge. Anything that needs a model goes through here, so the model,
 * the spend and the failure handling are in one place.
 */
export interface LlmRequest { system: string; user: string; model?: string; maxTokens?: number }
export interface LlmResult { text: string; inputTokens: number; outputTokens: number; model: string }

export const DEFAULT_MODEL = 'claude-sonnet-5';

export async function generateText(req: LlmRequest, apiKey: string, fetchImpl: typeof fetch = fetch): Promise<LlmResult> {
  const model = req.model ?? DEFAULT_MODEL;
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: req.maxTokens ?? 300, system: req.system, messages: [{ role: 'user', content: req.user }] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`model call failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  return { text, inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, model };
}
