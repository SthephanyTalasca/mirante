import { guardText } from "./language-guard";
import type { Category, RawObservation } from "./types";

export interface ParsedWindow {
  face_visible: boolean;
  observations: RawObservation[];
  end_state: string | null;
  rejected: { reason: string; item: unknown }[];
}

/** Extrai o primeiro objeto JSON de um texto (o modelo às vezes embrulha em ```json). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Resposta sem JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Valida e converte a resposta do modelo para observações em tempo absoluto.
 * frameTimes[i] = horário do quadro i; stepMs = intervalo entre quadros.
 */
export function parseWindowResponse(
  raw: unknown,
  opts: { participantId: string; frameTimes: number[]; stepMs: number; categories: Category[] },
): ParsedWindow {
  const rejected: ParsedWindow["rejected"] = [];
  const byCode = new Map(
    opts.categories.filter((c) => c.active && c.detection === "visual").map((c) => [c.code, c]),
  );
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.observations) ? obj.observations : [];
  const n = opts.frameTimes.length;
  const observations: RawObservation[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") { rejected.push({ reason: "formato", item }); continue; }
    const o = item as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code.trim() : "";
    const cat = byCode.get(code);
    if (!cat) { rejected.push({ reason: "código fora do catálogo", item }); continue; }

    let from = Number.isInteger(o.from_frame) ? (o.from_frame as number) : NaN;
    let to = Number.isInteger(o.to_frame) ? (o.to_frame as number) : from;
    if (!Number.isFinite(from)) { rejected.push({ reason: "quadro inválido", item }); continue; }
    if (to < from) [from, to] = [to, from];
    from = Math.max(0, Math.min(n - 1, from));
    to = Math.max(0, Math.min(n - 1, to));

    const conf = Number(o.confidence);
    if (!Number.isFinite(conf) || conf < 0 || conf > 1) { rejected.push({ reason: "confiança inválida", item }); continue; }

    const guarded = guardText(typeof o.description === "string" ? o.description : "", cat.description || cat.name);
    if (!guarded.ok && guarded.hits.length) rejected.push({ reason: "linguagem bloqueada (descrição substituída)", item });

    const mid = Math.floor((from + to) / 2);
    observations.push({
      participant_id: opts.participantId,
      category_code: code,
      start_ms: opts.frameTimes[from],
      end_ms: opts.frameTimes[to] + opts.stepMs,
      confidence: conf,
      frames: to - from + 1,
      description: guarded.text,
      ref_t_ms: opts.frameTimes[mid],
    });
  }

  const end = guardText(typeof obj.end_state === "string" ? obj.end_state : "", "");
  return {
    face_visible: obj.face_visible !== false,
    observations,
    end_state: end.ok ? end.text : null,
    rejected,
  };
}
