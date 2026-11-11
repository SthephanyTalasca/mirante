// Tipos compartilhados entre o app e o worker. Sem dependências externas.

export type GroupKey = "expressao" | "acao" | "engajamento";

export interface Category {
  id: string;
  code: string;
  name: string;
  group_key: GroupKey;
  detection: "visual" | "derivado";
  metric_key: string | null;
  description: string;
  criteria: string;
  min_confidence: number | null;
  min_frames: number;
  min_duration_ms: number;
  merge_gap_ms: number;
  color: string;
  active: boolean;
  sort_order?: number;
}

/** Retângulo normalizado (0–1) sobre o quadro inteiro, com validade temporal. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  start_ms: number;
  end_ms: number | null;
}

export interface Participant {
  id: string;
  label: string;
  is_host: boolean;
  color?: string;
  regions: Region[];
}

/** Uma observação vinda de uma janela, já convertida para tempo absoluto. */
export interface RawObservation {
  participant_id: string;
  category_code: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  frames: number;
  description: string;
  ref_t_ms: number;
  propagated?: boolean;
}

export interface ConsolidatedOccurrence {
  participant_id: string;
  category_id: string;
  category_code: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  support_frames: number;
  description: string;
  ref_t_ms: number;
}

/** Ocorrência como vem do banco (para métricas e relatório). */
export interface OccurrenceRow {
  id?: string;
  participant_id: string;
  category_id: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  review_status?: "pendente" | "confirmada" | "corrigida" | "rejeitada";
  description?: string;
}

export interface WindowCoverage {
  participant_id: string;
  start_ms: number;
  end_ms: number;
  status: "analisada" | "propagada" | "sem_imagem" | "falhou";
}

export interface Marker {
  id?: string;
  t_ms: number;
  label: string;
}

export interface OrgSettings {
  min_confidence: number;
  sample_fps: number;
  window_seconds: number;
  retention_video_days: number;
  retention_frames_days: number;
  store_reference_frames: boolean;
  ai_provider: "anthropic" | "openai" | "mock";
  ai_model: string | null;
  consent_policy_version: string;
}

export const DEFAULT_SETTINGS: OrgSettings = {
  min_confidence: 0.6,
  sample_fps: 1,
  window_seconds: 8,
  retention_video_days: 30,
  retention_frames_days: 30,
  store_reference_frames: true,
  ai_provider: "anthropic",
  ai_model: null,
  consent_policy_version: "v1",
};

export function withDefaults(s: Partial<OrgSettings> | null | undefined): OrgSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}
