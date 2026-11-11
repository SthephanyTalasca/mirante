"use client";
import clsx from "clsx";
import { Crown, Grid2x2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { fmtTime } from "@/lib/analysis/format";
import { overlapRatio, suggestGrid } from "@/lib/analysis/regions";
import type { Participant, Region } from "@/lib/analysis/types";
import { api, PARTICIPANT_COLORS } from "@/lib/ui";

interface P { key: string; label: string; is_host: boolean; color: string; regions: Region[] }
let seq = 0;
const newKey = () => `p${Date.now()}_${seq++}`;

export function RegionEditor(props: {
  meetingId: string;
  frames: { url: string; t_ms: number }[];
  aspect: number;
  initial: Participant[];
  initialNoHost: boolean;
  hasConsent: boolean;
  alreadyProcessed: boolean;
  locked: boolean;
}) {
  const router = useRouter();
  const [parts, setParts] = useState<P[]>(() => props.initial.map((p, i) => ({
    key: p.id, label: p.label, is_host: p.is_host, color: p.color ?? PARTICIPANT_COLORS[i % 8], regions: p.regions,
  })));
  const [sel, setSel] = useState<string | null>(parts[0]?.key ?? null);
  const [frameIdx, setFrameIdx] = useState(Math.min(1, props.frames.length - 1));
  const [noHost, setNoHost] = useState(props.initialNoHost);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [msg, setMsg] = useState<{ kind: "erro" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const t = props.frames[frameIdx]?.t_ms ?? 0;
  const at = (p: P) => p.regions.find((r) => t >= r.start_ms && (r.end_ms == null || t < r.end_ms));
  const host = parts.find((p) => p.is_host);
  const selected = parts.find((p) => p.key === sel);

  const warnings = useMemo(() => {
    const w: string[] = [];
    const hr = host && at(host);
    if (hr) for (const p of parts) {
      const r = !p.is_host && at(p);
      if (r && overlapRatio(r, hr) > 0.1) w.push(`A região de ${p.label} cobre parte da região do host neste quadro.`);
    }
    for (const p of parts) if (!p.regions.length) w.push(`${p.label} ainda não tem região desenhada.`);
    return w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, frameIdx]);

  const update = (key: string, fn: (p: P) => P) => setParts((ps) => ps.map((p) => (p.key === key ? fn(p) : p)));

  function addParticipant() {
    const i = parts.length;
    const p: P = { key: newKey(), label: `Participante ${parts.filter((x) => !x.is_host).length + 1}`, is_host: false, color: PARTICIPANT_COLORS[i % 8], regions: [] };
    setParts([...parts, p]); setSel(p.key);
  }

  function grid(n: number) {
    const cells = suggestGrid(n);
    const ps: P[] = cells.map((c, i) => ({ key: newKey(), label: `Participante ${i + 1}`, is_host: false, color: PARTICIPANT_COLORS[i % 8], regions: [{ ...c, start_ms: 0, end_ms: null }] }));
    setParts(ps); setSel(ps[0].key); setNoHost(false);
    setMsg({ kind: "ok", text: "Grade criada. Ajuste as regiões se necessário e marque o host." });
  }

  function setHost(key: string) {
    setNoHost(false);
    setParts((ps) => ps.map((p) => ({ ...p, is_host: p.key === key, label: p.key === key && /^Participante \d+$/.test(p.label) ? "Host" : p.label })));
  }

  // desenho
  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  function down(e: React.PointerEvent) {
    if (!selected || props.locked) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = rel(e); setDrag({ x0: x, y0: y, x1: x, y1: y });
  }
  function move(e: React.PointerEvent) { if (drag) { const { x, y } = rel(e); setDrag({ ...drag, x1: x, y1: y }); } }
  function up() {
    if (!drag || !selected) return setDrag(null);
    const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    setDrag(null);
    if (w < 0.03 || h < 0.03) return;
    const region = { x, y, w: Math.min(w, 1 - x), h: Math.min(h, 1 - y) };
    update(selected.key, (p) => {
      const cur = p.regions.find((r) => t >= r.start_ms && (r.end_ms == null || t < r.end_ms));
      if (!cur || cur.start_ms === t || p.regions.length === 0 || t === 0) {
        // substitui a região vigente
        return { ...p, regions: p.regions.length ? p.regions.map((r) => (r === cur ? { ...r, ...region } : r)) : [{ ...region, start_ms: 0, end_ms: null }] };
      }
      // layout mudou a partir deste quadro: encerra a região anterior aqui e começa outra
      return { ...p, regions: [...p.regions.map((r) => (r === cur ? { ...r, end_ms: t } : r)), { ...region, start_ms: t, end_ms: cur.end_ms }] };
    });
  }

  async function save(andProcess: boolean) {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/meetings/${props.meetingId}/participants`, {
        method: "PUT",
        json: { no_visible_host: noHost, participants: parts.map(({ label, is_host, color, regions }) => ({ label, is_host, color, regions })) },
      });
      if (andProcess) {
        await api(`/api/meetings/${props.meetingId}/process`, { method: "POST" });
        router.push(`/reunioes/${props.meetingId}`);
      } else { setMsg({ kind: "ok", text: "Participantes salvos." }); router.refresh(); }
    } catch (e) { setMsg({ kind: "erro", text: (e as Error).message }); }
    setBusy(false);
  }

  const analyzable = parts.filter((p) => !p.is_host && p.regions.length).length;
  const ready = props.hasConsent && analyzable > 0 && (noHost || !!host) && !props.locked;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="space-y-3">
        <div ref={box} className="relative select-none overflow-hidden rounded-[10px] bg-ink touch-none"
          style={{ aspectRatio: String(props.aspect), cursor: selected && !props.locked ? "crosshair" : "default" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.frames[frameIdx]?.url} alt={`Quadro em ${fmtTime(t)}`} className="pointer-events-none absolute inset-0 size-full object-fill" draggable={false} />
          {parts.map((p) => {
            const r = at(p);
            if (!r) return null;
            return (
              <div key={p.key} onPointerDown={(e) => { if (sel !== p.key) { e.stopPropagation(); setSel(p.key); } }}
                className={clsx("absolute border-2", sel === p.key && "ring-2 ring-white/80")}
                style={{
                  left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`,
                  borderColor: p.is_host ? "#ffffff" : p.color,
                  background: p.is_host ? "repeating-linear-gradient(135deg, rgba(20,33,61,.62) 0 8px, rgba(20,33,61,.38) 8px 16px)" : `${p.color}22`,
                }}>
                <span className="absolute left-0 top-0 inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: p.is_host ? "#14213d" : p.color }}>
                  {p.is_host && <Crown size={12} />}{p.label}{p.is_host && " · não analisado"}
                </span>
              </div>
            );
          })}
          {drag && (
            <div className="absolute border-2 border-dashed border-white bg-white/10"
              style={{ left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`, width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%` }} />
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Quadros de pré-visualização">
          {props.frames.map((f, i) => (
            <button key={i} role="tab" aria-selected={i === frameIdx} onClick={() => setFrameIdx(i)}
              className={clsx("relative w-28 shrink-0 overflow-hidden rounded-md border-2", i === frameIdx ? "border-lagoa" : "border-transparent opacity-70 hover:opacity-100")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" className="aspect-video w-full object-cover" />
              <span className="tabular absolute bottom-0 right-0 bg-ink/80 px-1 font-mono text-[11px] text-white">{fmtTime(f.t_ms)}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-slate">
          Selecione um participante na lista e arraste sobre o quadro. Se o layout mudar durante a reunião, escolha um quadro
          posterior e desenhe de novo: a nova posição vale a partir daquele momento.
        </p>
      </section>

      <aside className="space-y-4">
        <section className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Pessoas no vídeo</h2>
            <div className="flex gap-1">
              <select aria-label="Criar grade" className="input h-8 w-auto text-xs" value="" disabled={props.locked} onChange={(e) => e.target.value && grid(Number(e.target.value))}>
                <option value="">Grade…</option>
                {[2, 3, 4, 6, 9].map((n) => <option key={n} value={n}>{n} blocos</option>)}
              </select>
              <button className="btn btn-ghost h-8 px-2" onClick={addParticipant} disabled={props.locked} aria-label="Adicionar participante"><Plus size={15} /></button>
            </div>
          </div>
          {!parts.length && (
            <p className="flex items-start gap-2 text-sm text-slate"><Grid2x2 size={16} className="mt-0.5 shrink-0" />Use "Grade" para gravações em modo galeria ou adicione as pessoas uma a uma.</p>
          )}
          <ul className="space-y-2">
            {parts.map((p) => (
              <li key={p.key} onClick={() => setSel(p.key)}
                className={clsx("rounded-md border p-2.5 transition-colors", sel === p.key ? "border-lagoa bg-lagoa-wash/50" : "border-line hover:border-slate")}>
                <div className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: p.is_host ? "#14213d" : p.color }} />
                  <input aria-label="Rótulo" className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none" value={p.label}
                    onChange={(e) => update(p.key, (x) => ({ ...x, label: e.target.value }))} />
                  <button title="Remover" className="text-mute hover:text-crit" onClick={(e) => { e.stopPropagation(); setParts(parts.filter((x) => x.key !== p.key)); }}><Trash2 size={15} /></button>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-slate">
                  <label className="flex items-center gap-1.5">
                    <input type="radio" name="host" className="accent-[#14213d]" checked={p.is_host} onChange={() => setHost(p.key)} /> É o host
                  </label>
                  <span>{p.regions.length ? `${p.regions.length} posição(ões)` : "sem região"}</span>
                </div>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 border-t border-line-soft pt-3 text-sm">
            <input type="checkbox" className="mt-0.5 accent-[#0f7b7b]" checked={noHost} onChange={(e) => { setNoHost(e.target.checked); if (e.target.checked) setParts(parts.map((p) => ({ ...p, is_host: false }))); }} />
            <span>O host não aparece no vídeo <span className="text-slate">(ex.: só a tela compartilhada)</span></span>
          </label>
          <p className="mt-3 text-xs leading-relaxed text-mute">
            Use rótulos neutros ou nomes informados pelos próprios participantes. O Mirante não usa reconhecimento facial e os
            rótulos nunca são enviados ao modelo de IA.
          </p>
        </section>

        {(warnings.length > 0 || !props.hasConsent) && (
          <ul className="space-y-1 rounded-md border border-ambar/30 bg-ambar-wash px-4 py-3 text-sm text-[#6b4700]">
            {!props.hasConsent && <li>Registre o consentimento antes de processar.</li>}
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
        {props.alreadyProcessed && (
          <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-slate">
            Salvar alterações recria os participantes: ocorrências e revisões desta reunião serão apagadas e o vídeo precisará ser processado de novo.
          </p>
        )}
        {msg && <p role="status" className={clsx("text-sm", msg.kind === "erro" ? "text-crit" : "text-good")}>{msg.text}</p>}
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy || props.locked}>Salvar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={() => save(true)} disabled={busy || !ready}>
            Salvar e processar {analyzable > 0 && `${analyzable} participante(s)`}
          </button>
        </div>
      </aside>
    </div>
  );
}
