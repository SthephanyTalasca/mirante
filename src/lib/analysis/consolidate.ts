import type { Category, ConsolidatedOccurrence, RawObservation } from "./types";

/**
 * Consolidação temporal:
 *  - agrupa por participante + categoria;
 *  - junta intervalos sobrepostos ou separados por até merge_gap_ms (inclusive entre janelas),
 *    o que elimina duplicatas de quadros consecutivos;
 *  - confiança = média ponderada pelo nº de quadros de suporte;
 *  - descarta o que não atinge min_frames, min_duration_ms ou o limiar de confiança.
 */
export function consolidate(
  observations: RawObservation[],
  categories: Category[],
  orgMinConfidence: number,
  hostIds: Set<string> = new Set(),
): ConsolidatedOccurrence[] {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  const groups = new Map<string, RawObservation[]>();

  for (const o of observations) {
    if (hostIds.has(o.participant_id)) continue; // defesa extra: host nunca passa
    const cat = byCode.get(o.category_code);
    if (!cat || !cat.active || cat.detection !== "visual") continue;
    const key = `${o.participant_id}::${o.category_code}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(o);
  }

  const out: ConsolidatedOccurrence[] = [];
  for (const list of groups.values()) {
    const cat = byCode.get(list[0].category_code)!;
    list.sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms);

    let cur: Acc | null = null;
    const flush = () => {
      if (!cur) return;
      const conf = cur.weightedConf / cur.weight;
      const duration = cur.end - cur.start;
      const threshold = cat.min_confidence ?? orgMinConfidence;
      if (cur.frames >= cat.min_frames && duration >= cat.min_duration_ms && conf >= threshold) {
        out.push({
          participant_id: list[0].participant_id,
          category_id: cat.id,
          category_code: cat.code,
          start_ms: cur.start,
          end_ms: cur.end,
          confidence: round3(conf),
          support_frames: cur.frames,
          description: cur.bestDesc,
          ref_t_ms: cur.bestRef,
        });
      }
      cur = null;
    };

    for (const o of list) {
      // observações propagadas (janela estática) pesam um pouco menos
      const w = o.frames * (o.propagated ? 0.8 : 1);
      if (cur && o.start_ms - cur.end <= cat.merge_gap_ms) {
        cur.end = Math.max(cur.end, o.end_ms);
        cur.frames += o.frames;
        cur.weight += w;
        cur.weightedConf += o.confidence * w;
        if (!o.propagated && o.confidence > cur.bestConf) {
          cur.bestConf = o.confidence; cur.bestDesc = o.description; cur.bestRef = o.ref_t_ms;
        }
      } else {
        flush();
        cur = {
          start: o.start_ms, end: o.end_ms, frames: o.frames, weight: w, weightedConf: o.confidence * w,
          bestConf: o.confidence, bestDesc: o.description, bestRef: o.ref_t_ms,
        };
      }
    }
    flush();
  }

  return out.sort((a, b) => a.start_ms - b.start_ms || a.participant_id.localeCompare(b.participant_id));
}

interface Acc {
  start: number; end: number; frames: number; weight: number; weightedConf: number;
  bestConf: number; bestDesc: string; bestRef: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Projeta as observações de uma janela anterior para uma janela estática (sem chamar a IA). */
export function propagate(
  previous: RawObservation[],
  prevWindow: { start_ms: number; end_ms: number },
  next: { start_ms: number; end_ms: number },
): RawObservation[] {
  // só propaga o que estava ativo no fim da janela anterior
  return previous
    .filter((o) => o.end_ms >= prevWindow.end_ms - 1)
    .map((o) => ({
      ...o,
      start_ms: next.start_ms,
      end_ms: next.end_ms,
      frames: Math.max(1, Math.round((next.end_ms - next.start_ms) / Math.max(1, (o.end_ms - o.start_ms) / o.frames))),
      ref_t_ms: next.start_ms,
      propagated: true,
    }));
}
