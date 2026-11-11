import { guardText } from "../analysis/language-guard";
import { HttpError } from "./auth";

/** Valida um comportamento do catálogo. Nomes e critérios devem descrever sinais visíveis. */
export function sanitizeBehavior(b: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) {
    const g = guardText(String(b.name), "");
    if (!g.ok) throw new HttpError(400, "O nome deve descrever um sinal visível, não uma emoção ou intenção (ex.: \"Testa franzida\", não \"Irritado\").");
    out.name = g.text.slice(0, 80);
  }
  for (const k of ["description", "criteria"] as const) {
    if (b[k] !== undefined) {
      const g = guardText(String(b[k]), "");
      if (String(b[k]).trim() && !g.ok) throw new HttpError(400, `O campo "${k === "criteria" ? "critérios" : "descrição"}" usa termos de emoção ou intenção. Descreva o que se vê.`);
      out[k] = String(b[k]).trim().slice(0, 600);
    }
  }
  if (b.group_key !== undefined) {
    if (!["expressao", "acao", "engajamento"].includes(b.group_key)) throw new HttpError(400, "Grupo inválido.");
    out.group_key = b.group_key;
  }
  if (b.min_confidence !== undefined) out.min_confidence = b.min_confidence === null || b.min_confidence === "" ? null : Math.min(1, Math.max(0, Number(b.min_confidence)));
  for (const k of ["min_frames", "min_duration_ms", "merge_gap_ms", "sort_order"] as const)
    if (b[k] !== undefined) out[k] = Math.max(k === "min_frames" ? 1 : 0, Math.round(Number(b[k]) || 0));
  if (b.active !== undefined) out.active = !!b.active;
  if (b.color !== undefined && /^#[0-9a-f]{6}$/i.test(b.color)) out.color = b.color;
  return out;
}

