import type { Participant, Region } from "./types";

/**
 * Participantes analisáveis: TODOS exceto o host. É a única porta de entrada do worker
 * para escolher o que recortar — o host nunca é recortado nem enviado à IA.
 */
export function analyzableParticipants(participants: Participant[]): Participant[] {
  return participants.filter((p) => !p.is_host && p.regions.length > 0);
}

export function regionAt(p: Participant, t_ms: number): Region | null {
  return p.regions.find((r) => t_ms >= r.start_ms && (r.end_ms == null || t_ms < r.end_ms)) ?? null;
}

/** Converte região normalizada em pixels, garantindo que caiba no quadro. */
export function toPixels(r: Region, width: number, height: number) {
  const left = Math.max(0, Math.floor(r.x * width));
  const top = Math.max(0, Math.floor(r.y * height));
  const w = Math.max(1, Math.min(width - left, Math.round(r.w * width)));
  const h = Math.max(1, Math.min(height - top, Math.round(r.h * height)));
  return { left, top, width: w, height: h };
}

/** Sobreposição entre a região de um não-host e a do host (para avisar na configuração). */
export function overlapRatio(a: Region, b: Region): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / (a.w * a.h);
}

/** Sugere uma grade (galeria) com n blocos para acelerar a marcação manual. */
export function suggestGrid(n: number): Omit<Region, "start_ms" | "end_ms">[] {
  if (n <= 0) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const out: Omit<Region, "start_ms" | "end_ms">[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ x: c / cols, y: r / rows, w: 1 / cols - 0.0001, h: 1 / rows - 0.0001 });
  }
  return out;
}
