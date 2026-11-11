import type { Category } from "../src/lib/analysis/types";

const c = (code: string, name: string, group_key: Category["group_key"], min_frames: number, min_duration_ms: number, merge_gap_ms: number): Category => ({
  id: `id_${code}`, code, name, group_key, detection: "visual", metric_key: null,
  description: `Sinal: ${name.toLowerCase()}`, criteria: `Critério de ${name}`, min_confidence: null,
  min_frames, min_duration_ms, merge_gap_ms, color: "#3366ff", active: true,
});

/** Espelho reduzido do catálogo padrão (supabase/migrations/0003_seed_behaviors.sql). */
export const CATS: Category[] = [
  c("expressao_surpresa", "Expressão facial de surpresa", "expressao", 1, 0, 2000),
  c("sorriso", "Sorriso", "expressao", 1, 0, 3000),
  c("testa_franzida", "Testa franzida", "expressao", 2, 1000, 3000),
  c("aparencia_atencao", "Aparência de atenção", "expressao", 3, 4000, 4000),
  c("mexendo_celular", "Mexendo no celular", "acao", 2, 2000, 4000),
  c("desviando_olhar", "Desviando o olhar frequentemente", "acao", 3, 4000, 5000),
  c("olhando_apresentacao", "Olhando diretamente para a apresentação", "acao", 3, 5000, 4000),
  c("interagindo_camera", "Interagindo com a câmera", "acao", 1, 0, 2000),
  c("reacao_visual", "Reação visual visível", "acao", 1, 0, 2000),
];
