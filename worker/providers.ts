import { extractJson } from "../src/lib/analysis/parse";

export interface VisionRequest { system: string; prompt: string; image: Buffer }
export interface VisionResponse { json: unknown; text: string; input_tokens: number; output_tokens: number; model: string }
export interface VisionProvider { name: string; model: string; analyze(req: VisionRequest): Promise<VisionResponse> }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      if (status && status < 500 && status !== 429) throw e; // erro do cliente: não insiste
      await sleep(1000 * 2 ** i + Math.random() * 400);
    }
  }
  throw last;
}

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function anthropicProvider(apiKey: string, model: string): VisionProvider {
  return {
    name: "anthropic", model,
    analyze: (req) => withRetry(async () => {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 900, temperature: 0, system: req.system,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: req.image.toString("base64") } },
            { type: "text", text: req.prompt },
          ] }],
        }),
      });
      if (!r.ok) throw new HttpError(r.status, `Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      const text = (j.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
      return { json: extractJson(text), text, input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0, model };
    }),
  };
}

export function openaiProvider(apiKey: string, model: string, baseUrl = "https://api.openai.com/v1"): VisionProvider {
  return {
    name: "openai", model,
    analyze: (req) => withRetry(async () => {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model, temperature: 0, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: [
              { type: "text", text: req.prompt },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${req.image.toString("base64")}`, detail: "high" } },
            ] },
          ],
        }),
      });
      if (!r.ok) throw new HttpError(r.status, `OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content ?? "";
      return { json: extractJson(text), text, input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0, model };
    }),
  };
}

/**
 * Provedor de desenvolvimento: determinístico, sem custo. Gera observações plausíveis a partir
 * do brilho dos quadros, para testar o pipeline e o dashboard de ponta a ponta.
 */
export function mockProvider(onCall?: (req: VisionRequest) => void): VisionProvider {
  let n = 0;
  return {
    name: "mock", model: "mock-v1",
    async analyze(req) {
      onCall?.(req);
      n++;
      const frames = Number(/Folha de contato: (\d+) quadros/.exec(req.prompt)?.[1] ?? 8);
      const last = frames - 1;
      const obs: unknown[] = [{ code: "olhando_apresentacao", from_frame: 0, to_frame: last, confidence: 0.82, description: "Olhar voltado à tela de forma contínua" }];
      if (n % 3 === 0) obs.push({ code: "sorriso", from_frame: 1, to_frame: 2, confidence: 0.74, description: "Cantos da boca elevados" });
      if (n % 5 === 0) obs.push({ code: "mexendo_celular", from_frame: 3, to_frame: last, confidence: 0.7, description: "Olhar para baixo com mãos na altura do peito" });
      if (n % 7 === 0) obs.push({ code: "expressao_surpresa", from_frame: 2, to_frame: 2, confidence: 0.4, description: "Sobrancelhas erguidas" }); // abaixo do limiar
      if (n % 11 === 0) obs.push({ code: "sorriso", from_frame: 0, to_frame: 1, confidence: 0.9, description: "Parece muito feliz" }); // será neutralizado
      const json = { face_visible: true, observations: obs, end_state: "rosto frontal, olhar para a tela" };
      return { json, text: JSON.stringify(json), input_tokens: 0, output_tokens: 0, model: "mock-v1" };
    },
  };
}

export function providerFromEnv(name: string, model: string | null): VisionProvider {
  if (name === "mock") return mockProvider();
  if (name === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY não definida");
    return openaiProvider(key, model ?? process.env.OPENAI_MODEL ?? "gpt-4.1", process.env.OPENAI_BASE_URL);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não definida");
  return anthropicProvider(key, model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5");
}

/** Custo estimado em USD a partir de preços por milhão de tokens configurados no ambiente. */
export function estimateCost(inTok: number, outTok: number): number {
  const pin = Number(process.env.AI_PRICE_INPUT_PER_MTOK ?? 3);
  const pout = Number(process.env.AI_PRICE_OUTPUT_PER_MTOK ?? 15);
  return (inTok * pin + outTok * pout) / 1_000_000;
}
