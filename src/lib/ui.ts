export const STATUS_LABEL: Record<string, string> = {
  rascunho: "Aguardando envio",
  aguardando_configuracao: "Configurar participantes",
  na_fila: "Na fila",
  processando: "Processando",
  concluida: "Concluída",
  erro: "Erro",
  expirada: "Vídeo expirado",
};

export const MEETING_TYPE_LABEL: Record<string, string> = {
  reuniao: "Reunião",
  apresentacao_comercial: "Apresentação comercial",
  treinamento: "Treinamento",
  demonstracao: "Demonstração",
  outro: "Outro",
};

export const GROUP_LABEL: Record<string, string> = {
  expressao: "Expressão facial aparente",
  acao: "Comportamento ou ação",
  engajamento: "Indicador de engajamento visual",
};

/** Cores de série por grupo (paleta categórica validada: slots 1 e 2). */
export const GROUP_COLOR: Record<string, string> = {
  expressao: "#2a78d6",
  acao: "#eb6834",
  engajamento: "#1baf7a",
};

export const REVIEW_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmada: "Confirmada",
  corrigida: "Corrigida",
  rejeitada: "Rejeitada",
};

export const CONSENT_METHOD_LABEL: Record<string, string> = {
  aviso_na_gravacao: "Aviso no início da gravação",
  termo_assinado: "Termo assinado",
  aceite_na_plataforma: "Aceite na plataforma de reunião",
  outro: "Outro",
};

/** Cores para distinguir participantes na marcação de regiões (não usadas em gráficos). */
export const PARTICIPANT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Falha (${res.status})`);
  return data as T;
}
