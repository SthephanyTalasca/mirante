import type { Category, Marker, OccurrenceRow, Participant, WindowCoverage } from "./types";

// Códigos usados pelos indicadores derivados (configuráveis aqui).
export const ATTENTION_CODES = ["olhando_apresentacao", "aparencia_atencao"];
export const INTERACTION_CODES = ["interagindo_camera", "sorriso", "reacao_visual"];
export const MARKER_WINDOW_MS = 30_000;

export interface MeetingMetrics {
  duration_ms: number;
  participants_analyzed: number;
  total_occurrences: number;
  reviewed_ratio: number;
  by_category: { category_id: string; code: string; name: string; color: string; group: string; count: number; total_ms: number }[];
  per_minute: { minute: number; count: number; analyzed: boolean }[];
  participants: ParticipantMetrics[];
  peaks: { minute: number; count: number }[];
  lows: { minute: number; count: number }[];
  marker_reactions: { marker: Marker; occurrences: { participant_id: string; code: string; start_ms: number }[] }[];
}

export interface ParticipantMetrics {
  participant_id: string;
  label: string;
  analyzed_ms: number;
  no_image_ms: number;
  occurrences: number;
  by_code: Record<string, number>;
  attention_ratio: number | null;      // % do tempo analisado com sinais de atenção visual aparente
  interactions: number;
  interaction_rate_10min: number | null;
  expression_changes: number;
  first_ms: number | null;
  last_ms: number | null;
}

/** Soma de intervalos após união (evita contar sobreposição duas vezes). */
export function unionMs(intervals: [number, number][]): number {
  if (!intervals.length) return 0;
  const s = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = s[0];
  for (let i = 1; i < s.length; i++) {
    const [a, b] = s[i];
    if (a <= ce) ce = Math.max(ce, b);
    else { total += ce - cs; cs = a; ce = b; }
  }
  return total + (ce - cs);
}

export function computeMetrics(input: {
  duration_ms: number;
  participants: Participant[];
  categories: Category[];
  occurrences: OccurrenceRow[];
  coverage: WindowCoverage[];
  markers: Marker[];
}): MeetingMetrics {
  const cats = new Map(input.categories.map((c) => [c.id, c]));
  const occ = input.occurrences.filter((o) => o.review_status !== "rejeitada" && cats.has(o.category_id));
  const analyzed = input.participants.filter((p) => !p.is_host);
  const analyzedIds = new Set(analyzed.map((p) => p.id));
  const valid = occ.filter((o) => analyzedIds.has(o.participant_id));

  // distribuição
  const byCat = new Map<string, { count: number; total_ms: number }>();
  for (const o of valid) {
    const b = byCat.get(o.category_id) ?? { count: 0, total_ms: 0 };
    b.count++; b.total_ms += o.end_ms - o.start_ms;
    byCat.set(o.category_id, b);
  }
  const by_category = [...byCat.entries()]
    .map(([id, v]) => {
      const c = cats.get(id)!;
      return { category_id: id, code: c.code, name: c.name, color: c.color, group: c.group_key, ...v };
    })
    .sort((a, b) => b.count - a.count);

  // densidade por minuto
  const minutes = Math.max(1, Math.ceil(input.duration_ms / 60_000));
  const per = Array.from({ length: minutes }, (_, minute) => ({ minute, count: 0, analyzed: false }));
  for (const o of valid) { const m = Math.min(minutes - 1, Math.floor(o.start_ms / 60_000)); per[m].count++; }
  for (const w of input.coverage) {
    if (w.status === "analisada" || w.status === "propagada") {
      for (let m = Math.floor(w.start_ms / 60_000); m <= Math.min(minutes - 1, Math.floor((w.end_ms - 1) / 60_000)); m++) per[m].analyzed = true;
    }
  }
  const ranked = per.filter((p) => p.analyzed).sort((a, b) => b.count - a.count || a.minute - b.minute);
  const peaks = ranked.filter((p) => p.count > 0).slice(0, 3).map(({ minute, count }) => ({ minute, count }));
  const lows = [...ranked].reverse().slice(0, 3).map(({ minute, count }) => ({ minute, count }));

  // por participante
  const codeOf = (o: OccurrenceRow) => cats.get(o.category_id)!.code;
  const participants: ParticipantMetrics[] = analyzed.map((p) => {
    const mine = valid.filter((o) => o.participant_id === p.id).sort((a, b) => a.start_ms - b.start_ms);
    const cov = input.coverage.filter((w) => w.participant_id === p.id);
    const analyzed_ms = unionMs(cov.filter((w) => w.status === "analisada" || w.status === "propagada").map((w) => [w.start_ms, w.end_ms]));
    const no_image_ms = unionMs(cov.filter((w) => w.status === "sem_imagem").map((w) => [w.start_ms, w.end_ms]));
    const by_code: Record<string, number> = {};
    for (const o of mine) by_code[codeOf(o)] = (by_code[codeOf(o)] ?? 0) + 1;

    const att = unionMs(mine.filter((o) => ATTENTION_CODES.includes(codeOf(o))).map((o) => [o.start_ms, o.end_ms]));
    const interactions = mine.filter((o) => INTERACTION_CODES.includes(codeOf(o))).length;

    const expr = mine.filter((o) => cats.get(o.category_id)!.group_key === "expressao");
    let changes = 0;
    for (let i = 1; i < expr.length; i++) if (expr[i].category_id !== expr[i - 1].category_id) changes++;

    return {
      participant_id: p.id,
      label: p.label,
      analyzed_ms,
      no_image_ms,
      occurrences: mine.length,
      by_code,
      attention_ratio: analyzed_ms > 0 ? Math.min(1, att / analyzed_ms) : null,
      interactions,
      interaction_rate_10min: analyzed_ms > 0 ? (interactions / analyzed_ms) * 600_000 : null,
      expression_changes: changes,
      first_ms: mine[0]?.start_ms ?? null,
      last_ms: mine.at(-1)?.start_ms ?? null,
    };
  });

  const marker_reactions = input.markers.map((marker) => ({
    marker,
    occurrences: valid
      .filter((o) => o.start_ms >= marker.t_ms && o.start_ms <= marker.t_ms + MARKER_WINDOW_MS)
      .map((o) => ({ participant_id: o.participant_id, code: codeOf(o), start_ms: o.start_ms })),
  }));

  const reviewed = input.occurrences.filter((o) => o.review_status && o.review_status !== "pendente").length;
  return {
    duration_ms: input.duration_ms,
    participants_analyzed: analyzed.length,
    total_occurrences: valid.length,
    reviewed_ratio: input.occurrences.length ? reviewed / input.occurrences.length : 0,
    by_category,
    per_minute: per,
    participants,
    peaks,
    lows,
    marker_reactions,
  };
}
