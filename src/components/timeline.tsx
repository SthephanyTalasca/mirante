"use client";
import clsx from "clsx";
import { useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/analysis/format";
import type { Category, Marker } from "@/lib/analysis/types";
import { GROUP_COLOR } from "@/lib/ui";

export interface TOcc {
  id: string; participant_id: string; category_id: string; start_ms: number; end_ms: number;
  confidence: number; description: string; review_status: string; frame_ref_path: string | null; source: string;
}
export interface TPart { id: string; label: string; is_host: boolean; color: string }

/**
 * Linha do tempo interativa: uma faixa por participante (host fora), régua em minutos,
 * marcos da apresentação em âmbar, cabeçote de reprodução. Clique numa ocorrência → vídeo vai ao trecho.
 */
export function Timeline({ duration, participants, occurrences, categories, markers, current, selectedId, onSelect, onSeek }: {
  duration: number;
  participants: TPart[];
  occurrences: TOcc[];
  categories: Category[];
  markers: Marker[];
  current: number;
  selectedId: string | null;
  onSelect: (o: TOcc) => void;
  onSeek: (ms: number) => void;
}) {
  const cat = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const lanes = participants.filter((p) => !p.is_host);
  const [hover, setHover] = useState<{ o: TOcc; x: number; y: number } | null>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const D = Math.max(duration, 1);
  const pctOf = (ms: number) => `${(ms / D) * 100}%`;

  const step = D > 3_600_000 ? 600_000 : D > 1_200_000 ? 300_000 : D > 300_000 ? 60_000 : 30_000;
  const ticks = Array.from({ length: Math.floor(D / step) + 1 }, (_, i) => i * step);

  const seekFromEvent = (e: React.MouseEvent) => {
    const r = ruler.current!.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(D, ((e.clientX - r.left) / r.width) * D)));
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-[140px_1fr] items-stretch">
        {/* régua */}
        <div className="border-b border-line" />
        <div ref={ruler} onClick={seekFromEvent} className="relative h-8 cursor-pointer border-b border-line" title="Clique para ir a este momento">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0 h-full border-l border-line" style={{ left: pctOf(t) }}>
              <span className="tabular absolute left-1 top-1.5 font-mono text-[11px] text-mute">{fmtTime(t).replace(/^00:/, "")}</span>
            </span>
          ))}
          {markers.map((m, i) => (
            <span key={i} className="absolute bottom-0 -translate-x-1/2" style={{ left: pctOf(m.t_ms) }} title={`${fmtTime(m.t_ms)} — ${m.label}`}>
              <span className="block size-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-ambar" />
            </span>
          ))}
        </div>

        {lanes.map((p) => {
          const mine = occurrences.filter((o) => o.participant_id === p.id);
          return (
            <div key={p.id} className="contents">
              <div className="flex items-center gap-2 border-b border-line-soft py-2 pr-3 text-sm font-medium">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                <span className="truncate">{p.label}</span>
              </div>
              <div className="relative h-11 border-b border-line-soft bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(10%-1px),#eef1f4_calc(10%-1px),#eef1f4_10%)]">
                {mine.map((o) => {
                  const c = cat.get(o.category_id);
                  if (!c) return null;
                  // expressões na metade de cima, ações na de baixo: sobreposições ficam legíveis
                  const top = c.group_key === "expressao" ? 6 : 23;
                  return (
                    <button key={o.id} onClick={() => onSelect(o)}
                      onMouseEnter={(e) => setHover({ o, x: e.clientX, y: e.clientY })} onMouseLeave={() => setHover(null)}
                      aria-label={`${fmtTime(o.start_ms)}, ${p.label}, ${c.name}`}
                      className={clsx("absolute h-[14px] rounded-[3px] outline-offset-1 transition-opacity",
                        selectedId && selectedId !== o.id && "opacity-45",
                        selectedId === o.id && "outline-2 outline-ink",
                        o.review_status === "pendente" && "[background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.28)_0_3px,transparent_3px_6px)]")}
                      style={{ left: pctOf(o.start_ms), width: `max(4px, ${((o.end_ms - o.start_ms) / D) * 100}%)`, top, background: GROUP_COLOR[c.group_key] }} />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* marcos e cabeçote atravessam todas as faixas */}
      <div className="pointer-events-none absolute inset-y-0 left-[140px] right-0">
        {markers.map((m, i) => <span key={i} className="absolute inset-y-0 border-l border-dashed border-ambar/70" style={{ left: pctOf(m.t_ms) }} />)}
        <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-lagoa" style={{ left: pctOf(current) }} />
      </div>

      {hover && (() => {
        const c = cat.get(hover.o.category_id)!;
        return (
          <div className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-md border border-line bg-white px-3 py-2 text-xs shadow-[0_8px_28px_-12px_rgba(20,33,61,.4)]"
            style={{ left: hover.x, top: hover.y }}>
            <div className="font-semibold text-ink">{c.name}</div>
            <div className="tabular font-mono text-slate">{fmtTime(hover.o.start_ms)} – {fmtTime(hover.o.end_ms)} · {Math.round(hover.o.confidence * 100)}%</div>
            <div className="mt-1 text-slate">{hover.o.description}</div>
          </div>
        );
      })()}
    </div>
  );
}
