import { fmtDuration, fmtTime, pct } from "./format";
import { guardText, USAGE_NOTICE } from "./language-guard";
import type { MeetingMetrics } from "./metrics";
import type { Category, Participant } from "./types";

export interface ReportSection {
  key: string;
  title: string;
  items: string[];
}

export interface ReportContent {
  generated_at: string;
  notice: string;
  headline: string;
  sections: ReportSection[];
  comparison: {
    participant_id: string;
    label: string;
    analyzed: string;
    occurrences: number;
    attention: string;
    interactions: number;
    expression_changes: number;
  }[];
  metrics: MeetingMetrics;
}

/**
 * Relatório determinístico: todo texto é montado a partir de métricas, com vocabulário
 * controlado. Nada aqui é escrito livremente por um modelo — por isso não há como o relatório
 * "inventar" diagnósticos. Ainda assim cada linha passa pela guarda de linguagem.
 */
export function buildReport(m: MeetingMetrics, participants: Participant[], categories: Category[]): ReportContent {
  const label = new Map(participants.map((p) => [p.id, p.label]));
  const catByCode = new Map(categories.map((c) => [c.code, c]));
  const minute = (n: number) => `${fmtTime(n * 60_000).slice(0, 5)}–${fmtTime((n + 1) * 60_000).slice(0, 5)}`;

  const top = m.by_category.slice(0, 5);
  const principais = top.length
    ? top.map((c) => `${c.name}: ${c.count} ocorrência(s), ${fmtDuration(c.total_ms)} somados.`)
    : ["Nenhum comportamento acima do limiar de confiança foi registrado."];

  const durational = [...m.by_category].sort((a, b) => b.total_ms - a.total_ms).slice(0, 3);
  const recorrentes = durational.map((c) => `${c.name} foi o sinal com maior tempo acumulado (${fmtDuration(c.total_ms)}).`).slice(0, 1)
    .concat(m.by_category.filter((c) => c.count >= 3).slice(0, 4).map((c) => `${c.name} se repetiu ${c.count} vezes.`));

  const byInteraction = [...m.participants].sort((a, b) => b.interactions - a.interactions);
  const interacoes = byInteraction.filter((p) => p.interactions > 0).slice(0, 3)
    .map((p) => `${p.label}: ${p.interactions} interação(ões) visual(is) registrada(s)` +
      (p.interaction_rate_10min != null ? ` (${p.interaction_rate_10min.toFixed(1).replace(".", ",")} a cada 10 min analisados).` : "."));
  if (!interacoes.length) interacoes.push("Nenhuma interação visual (acenos, sorrisos, reações) foi registrada.");

  const picos = m.peaks.map((p) => `${minute(p.minute)}: ${p.count} ocorrência(s).`);
  if (m.lows.length) picos.push(`Menor concentração: ${m.lows.map((l) => `${minute(l.minute)} (${l.count})`).join(", ")}.`);

  const eventos: string[] = [];
  for (const r of m.marker_reactions) {
    if (!r.occurrences.length) { eventos.push(`${fmtTime(r.marker.t_ms)} — ${r.marker.label}: nenhuma ocorrência nos 30 s seguintes.`); continue; }
    const counts = new Map<string, number>();
    r.occurrences.forEach((o) => counts.set(o.code, (counts.get(o.code) ?? 0) + 1));
    const desc = [...counts.entries()].map(([code, n]) => `${catByCode.get(code)?.name ?? code} (${n})`).join(", ");
    const who = new Set(r.occurrences.map((o) => label.get(o.participant_id) ?? "?"));
    eventos.push(`${fmtTime(r.marker.t_ms)} — ${r.marker.label}: ${desc}; ${who.size} participante(s).`);
  }
  const surpresa = catByCode.get("expressao_surpresa");
  if (surpresa) {
    const c = m.by_category.find((x) => x.code === surpresa.code);
    if (c) eventos.push(`${c.count} registro(s) de "${surpresa.name}" ao longo da reunião.`);
  }
  if (!eventos.length) eventos.push("Nenhum marco foi registrado. Adicione marcos (ex.: apresentação de preço) para medir reações a acontecimentos.");

  const cobertura = m.participants.map((p) =>
    `${p.label}: ${fmtDuration(p.analyzed_ms)} analisados` + (p.no_image_ms > 0 ? `, ${fmtDuration(p.no_image_ms)} sem imagem (câmera desligada ou fora do quadro).` : "."));

  const safe = (items: string[]) => items.map((t) => guardText(t, "[linha removida pela guarda de linguagem]").text);

  const sections: ReportSection[] = [
    { key: "principais", title: "Principais comportamentos observados", items: safe(principais) },
    { key: "interacoes", title: "Participantes com maior frequência de interações visuais", items: safe(interacoes) },
    { key: "recorrentes", title: "Comportamentos mais recorrentes", items: safe(recorrentes.length ? recorrentes : ["Sem recorrências relevantes."]) },
    { key: "picos", title: "Momentos de maior concentração de ocorrências", items: safe(picos.length ? picos : ["Sem dados suficientes."]) },
    { key: "eventos", title: "Eventos relevantes durante a apresentação", items: safe(eventos) },
    { key: "cobertura", title: "Cobertura da análise", items: safe(cobertura) },
  ];

  const comparison = m.participants.map((p) => ({
    participant_id: p.participant_id,
    label: p.label,
    analyzed: fmtDuration(p.analyzed_ms),
    occurrences: p.occurrences,
    attention: p.attention_ratio == null ? "—" : pct(p.attention_ratio),
    interactions: p.interactions,
    expression_changes: p.expression_changes,
  }));

  const headline = `${m.total_occurrences} ocorrência(s) em ${m.participants_analyzed} participante(s) analisado(s), ` +
    `em ${fmtDuration(m.duration_ms)} de gravação. ${pct(m.reviewed_ratio)} revisadas por pessoas.`;

  return { generated_at: new Date().toISOString(), notice: USAGE_NOTICE, headline, sections, comparison, metrics: m };
}
