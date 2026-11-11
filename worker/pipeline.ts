import { consolidate, propagate } from "../src/lib/analysis/consolidate";
import { parseWindowResponse } from "../src/lib/analysis/parse";
import { buildUserPrompt, SYSTEM_PROMPT } from "../src/lib/analysis/prompt";
import { analyzableParticipants, regionAt, toPixels } from "../src/lib/analysis/regions";
import type { Category, ConsolidatedOccurrence, OrgSettings, Participant, RawObservation } from "../src/lib/analysis/types";
import { contactSheet, crop, sigDiff, signature, sigStd } from "./imaging";
import type { ExtractedFrame } from "./media";
import { estimateCost, type VisionProvider } from "./providers";

// Limiares do gating (0–255). Ajustáveis por ambiente.
const NO_IMAGE_STD = Number(process.env.GATE_NO_IMAGE_STD ?? 6);
const STATIC_DIFF = Number(process.env.GATE_STATIC_DIFF ?? 2.5);
const MAX_PROPAGATION_CHAIN = Number(process.env.GATE_MAX_CHAIN ?? 3); // força reanálise a cada N janelas estáticas
const SEGMENT_WINDOWS = 10;   // janelas por segmento paralelizável
const SHEET_COLUMNS = 4;

export type WindowStatus = "analisada" | "propagada" | "sem_imagem" | "falhou";

export interface WindowRecord {
  participant_id: string;
  start_ms: number;
  end_ms: number;
  frame_count: number;
  status: WindowStatus;
  model?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  raw_response?: { observations: RawObservation[]; end_state: string | null; rejected?: unknown[]; error?: string; text?: string };
}

export interface OccurrenceToSave extends ConsolidatedOccurrence { frame_ref_path: string | null }

export interface PipelineStore {
  existingWindows(meetingId: string): Promise<WindowRecord[]>;
  saveWindow(meetingId: string, w: WindowRecord): Promise<void>;
  replaceAiOccurrences(meetingId: string, occ: OccurrenceToSave[]): Promise<void>;
  uploadFrame(key: string, jpeg: Buffer): Promise<string>;
  setProgress(meetingId: string, progress: number): Promise<void>;
}

export interface AnalysisInput {
  meetingId: string;
  orgId: string;
  frames: ExtractedFrame[];
  frameWidth: number;
  frameHeight: number;
  participants: Participant[];
  categories: Category[];
  settings: OrgSettings;
  provider: VisionProvider;
  store: PipelineStore;
  concurrency?: number;
}

export interface AnalysisStats {
  windows_total: number;
  analyzed: number;
  propagated: number;
  no_image: number;
  failed: number;
  reused: number;
  ai_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  observations: number;
  occurrences: number;
  rejected_items: number;
  host_excluded: string[];
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function analyze(input: AnalysisInput): Promise<AnalysisStats> {
  const { frames, settings, provider, store, meetingId } = input;
  if (!frames.length) throw new Error("Nenhum quadro extraído");

  const step = Math.round(1000 / settings.sample_fps);
  const W = settings.window_seconds * 1000;
  const totalMs = frames.at(-1)!.t_ms + step;
  const nWindows = Math.ceil(totalMs / W);

  const hostIds = new Set(input.participants.filter((p) => p.is_host).map((p) => p.id));
  const targets = analyzableParticipants(input.participants); // ← host fica de fora aqui
  const existing = new Map((await store.existingWindows(meetingId)).map((w) => [`${w.participant_id}:${w.start_ms}`, w]));

  const stats: AnalysisStats = {
    windows_total: 0, analyzed: 0, propagated: 0, no_image: 0, failed: 0, reused: 0, ai_calls: 0,
    input_tokens: 0, output_tokens: 0, cost_usd: 0, observations: 0, occurrences: 0, rejected_items: 0,
    host_excluded: [...hostIds],
  };
  const allObs: RawObservation[] = [];

  // tarefas = (participante, segmento de janelas). Dentro do segmento, janelas são sequenciais
  // para dar continuidade (estado anterior + propagação); segmentos rodam em paralelo.
  const tasks: { p: Participant; from: number; to: number }[] = [];
  for (const p of targets) for (let s = 0; s < nWindows; s += SEGMENT_WINDOWS) tasks.push({ p, from: s, to: Math.min(nWindows, s + SEGMENT_WINDOWS) });
  const totalUnits = targets.length * nWindows;
  let doneUnits = 0, lastReported = -1;

  const report = async () => {
    const pct = Math.min(95, Math.round((doneUnits / Math.max(1, totalUnits)) * 95));
    if (pct !== lastReported) { lastReported = pct; await store.setProgress(meetingId, pct); }
  };

  await pool(tasks, input.concurrency ?? 4, async ({ p, from, to }) => {
    let prevObs: RawObservation[] = [];
    let prevWin: { start_ms: number; end_ms: number } | null = null;
    let prevSig: Uint8Array | null = null;
    let prevState: string | null = null;
    let chain = 0;

    for (let k = from; k < to; k++) {
      const win = { start_ms: k * W, end_ms: Math.min(totalMs, (k + 1) * W) };
      doneUnits++;
      const key = `${p.id}:${win.start_ms}`;
      const done = existing.get(key);
      if (done && done.status !== "falhou") {
        // retomada idempotente: reaproveita a janela já processada
        stats.reused++; stats.windows_total++;
        const obs = done.raw_response?.observations ?? [];
        allObs.push(...obs);
        prevObs = obs; prevWin = win; prevSig = null; prevState = done.raw_response?.end_state ?? null;
        continue;
      }

      const inWin = frames.filter((f) => f.t_ms >= win.start_ms && f.t_ms < win.end_ms && regionAt(p, f.t_ms));
      if (!inWin.length) continue;
      stats.windows_total++;

      try {
        const crops = await Promise.all(inWin.map((f) => crop(f.path, toPixels(regionAt(p, f.t_ms)!, input.frameWidth, input.frameHeight))));
        const sigs = await Promise.all(crops.map(signature));
        const times = inWin.map((f) => f.t_ms);

        // 1) câmera desligada / quadro uniforme → não chama IA
        const avgStd = sigs.reduce((a, s) => a + sigStd(s), 0) / sigs.length;
        if (avgStd < NO_IMAGE_STD) {
          await store.saveWindow(meetingId, { participant_id: p.id, ...win, frame_count: inWin.length, status: "sem_imagem", raw_response: { observations: [], end_state: null } });
          stats.no_image++; prevObs = []; prevWin = win; prevSig = sigs.at(-1)!; chain = 0;
          await report(); continue;
        }

        // 2) janela estática → propaga a anterior sem nova chamada
        let motion = 0;
        for (let i = 1; i < sigs.length; i++) motion = Math.max(motion, sigDiff(sigs[i - 1], sigs[i]));
        if (prevSig) motion = Math.max(motion, sigDiff(prevSig, sigs[0]));
        if (prevWin && prevSig && prevObs.length && chain < MAX_PROPAGATION_CHAIN && motion < STATIC_DIFF) {
          const obs = propagate(prevObs, prevWin, win);
          allObs.push(...obs);
          await store.saveWindow(meetingId, { participant_id: p.id, ...win, frame_count: inWin.length, status: "propagada", raw_response: { observations: obs, end_state: prevState } });
          stats.propagated++; stats.observations += obs.length;
          prevObs = obs; prevWin = win; prevSig = sigs.at(-1)!; chain++;
          await report(); continue;
        }

        // 3) análise: uma folha de contato por janela
        const sheet = await contactSheet(crops, times, SHEET_COLUMNS);
        const prompt = buildUserPrompt({ categories: input.categories, frameTimes: times, columns: SHEET_COLUMNS, previousState: prevState });
        const res = await provider.analyze({ system: SYSTEM_PROMPT, prompt, image: sheet });
        stats.ai_calls++;
        const parsed = parseWindowResponse(res.json, { participantId: p.id, frameTimes: times, stepMs: step, categories: input.categories });
        const cost = estimateCost(res.input_tokens, res.output_tokens);
        stats.input_tokens += res.input_tokens; stats.output_tokens += res.output_tokens; stats.cost_usd += cost;
        stats.observations += parsed.observations.length; stats.rejected_items += parsed.rejected.length;
        stats.analyzed++;
        allObs.push(...parsed.observations);
        await store.saveWindow(meetingId, {
          participant_id: p.id, ...win, frame_count: inWin.length, status: "analisada",
          model: res.model, input_tokens: res.input_tokens, output_tokens: res.output_tokens, cost_usd: cost,
          raw_response: { observations: parsed.observations, end_state: parsed.end_state, rejected: parsed.rejected },
        });
        prevObs = parsed.observations; prevWin = win; prevSig = sigs.at(-1)!; prevState = parsed.end_state; chain = 0;
      } catch (e) {
        stats.failed++;
        await store.saveWindow(meetingId, { participant_id: p.id, ...win, frame_count: inWin.length, status: "falhou", raw_response: { observations: [], end_state: null, error: String((e as Error).message ?? e) } });
        prevObs = []; prevSig = null; chain = 0;
      }
      await report();
    }
  });

  // consolidação temporal
  const occ = consolidate(allObs, input.categories, settings.min_confidence, hostIds);
  stats.occurrences = occ.length;

  // frame de referência (somente recorte do participante, nunca o quadro inteiro)
  const byId = new Map(targets.map((p) => [p.id, p]));
  const toSave: OccurrenceToSave[] = [];
  for (const o of occ) {
    let frame_ref_path: string | null = null;
    if (settings.store_reference_frames) {
      const p = byId.get(o.participant_id)!;
      const f = frames.reduce((best, f) => (Math.abs(f.t_ms - o.ref_t_ms) < Math.abs(best.t_ms - o.ref_t_ms) ? f : best), frames[0]);
      const r = regionAt(p, f.t_ms);
      if (r) {
        const buf = await crop(f.path, toPixels(r, input.frameWidth, input.frameHeight), 320);
        frame_ref_path = await store.uploadFrame(`${input.orgId}/${meetingId}/${o.participant_id}_${o.category_code}_${o.start_ms}.jpg`, buf);
      }
    }
    toSave.push({ ...o, frame_ref_path });
  }
  await store.replaceAiOccurrences(meetingId, toSave);
  stats.cost_usd = Math.round(stats.cost_usd * 100000) / 100000;
  return stats;
}
