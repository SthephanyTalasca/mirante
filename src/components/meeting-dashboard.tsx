"use client";
import clsx from "clsx";
import { Check, Download, Flag, Pencil, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDuration, fmtTime, pct } from "@/lib/analysis/format";
import type { MeetingMetrics } from "@/lib/analysis/metrics";
import type { ReportContent } from "@/lib/analysis/report";
import type { Category, Marker } from "@/lib/analysis/types";
import { api, GROUP_COLOR, GROUP_LABEL, REVIEW_LABEL } from "@/lib/ui";
import { CategoryBars, DensityChart, GroupLegend } from "./charts";
import { DeleteMeetingButton, RetryButton } from "./meeting-actions";
import { ReportView } from "./report-view";
import { Timeline, type TOcc, type TPart } from "./timeline";
import { ConfidenceBar, PageHeader, Stat, StatusBadge, UsageNotice } from "./ui";
import { VideoPanel, type VideoHandle } from "./video-panel";

type Tab = "geral" | "linha" | "participantes" | "relatorio";
const TABS: { key: Tab; label: string }[] = [
  { key: "geral", label: "Visão geral" },
  { key: "linha", label: "Linha do tempo e revisão" },
  { key: "participantes", label: "Participantes" },
  { key: "relatorio", label: "Relatório" },
];

export function MeetingDashboard(props: {
  meeting: { id: string; title: string; subtitle: string; status: string; duration_ms: number; video_available: boolean; stats: Record<string, any> };
  participants: TPart[];
  categories: Category[];
  occurrences: TOcc[];
  markers: Marker[];
  metrics: MeetingMetrics;
  report: { version: number; content: ReportContent; created_at: string } | null;
  canEdit: boolean;
  canAdmin: boolean;
}) {
  const { meeting, metrics } = props;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("geral");
  const [occ, setOcc] = useState(props.occurrences);
  const [selected, setSelected] = useState<TOcc | null>(null);
  const [current, setCurrent] = useState(0);
  const [codes, setCodes] = useState<Set<string>>(new Set());
  const [minConf, setMinConf] = useState(0);
  const [review, setReview] = useState<string>("todas");
  const [who, setWho] = useState<string>("todos");
  const video = useRef<VideoHandle>(null);
  useEffect(() => setOcc(props.occurrences), [props.occurrences]);

  const catById = useMemo(() => new Map(props.categories.map((c) => [c.id, c])), [props.categories]);
  const partById = useMemo(() => new Map(props.participants.map((p) => [p.id, p])), [props.participants]);
  const visualCats = props.categories.filter((c) => c.detection === "visual");

  const filtered = occ.filter((o) => {
    const c = catById.get(o.category_id);
    if (!c) return false;
    if (codes.size && !codes.has(c.code)) return false;
    if (o.confidence < minConf) return false;
    if (review === "todas" ? o.review_status === "rejeitada" : o.review_status !== review) return false;
    if (who !== "todos" && o.participant_id !== who) return false;
    return true;
  });

  function go(o: TOcc) { setSelected(o); setTab("linha"); video.current?.seek(o.start_ms); setCurrent(o.start_ms); }
  function seek(ms: number) { video.current?.seek(ms); setCurrent(ms); }

  async function doReview(o: TOcc, action: string, extra: Record<string, unknown> = {}) {
    const updated = await api<TOcc>(`/api/occurrences/${o.id}`, { method: "PATCH", json: { action, ...extra } });
    setOcc((list) => list.map((x) => (x.id === o.id ? { ...x, ...updated, confidence: Number(updated.confidence) } : x)));
    setSelected((s) => (s?.id === o.id ? { ...s, ...updated, confidence: Number(updated.confidence) } : s));
  }

  const coverage = metrics.participants.reduce((a, p) => a + p.analyzed_ms, 0) / Math.max(1, metrics.duration_ms * metrics.participants_analyzed);

  return (
    <>
      <PageHeader
        back={<Link href="/reunioes" className="hover:text-ink">← Reuniões</Link>}
        title={meeting.title}
        subtitle={meeting.subtitle}
        actions={<>
          <StatusBadge status={meeting.status} />
          <a className="btn btn-ghost" href={`/api/meetings/${meeting.id}/export`}><Download size={15} />CSV</a>
          {props.canEdit && <Link className="btn btn-ghost" href={`/reunioes/${meeting.id}/configurar`}>Participantes</Link>}
          {props.canEdit && meeting.video_available && <RetryButton meetingId={meeting.id} label="Reprocessar" />}
        </>}
      />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={clsx("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
              tab === t.key ? "border-lagoa text-ink" : "border-transparent text-slate hover:text-ink")}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "geral" && (
        <div className="space-y-6">
          <section className="panel grid grid-cols-2 gap-6 p-6 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Duração" value={fmtDuration(metrics.duration_ms)} />
            <Stat label="Participantes analisados" value={metrics.participants_analyzed} hint="host excluído" />
            <Stat label="Ocorrências" value={metrics.total_occurrences} />
            <Stat label="Tempo com imagem analisável" value={pct(coverage)} hint="câmeras desligadas ficam de fora" />
            <Stat label="Revisadas" value={pct(metrics.reviewed_ratio)} />
            <Stat label="Chamadas à IA" value={meeting.stats.ai_calls ?? "—"}
              hint={meeting.stats.propagated != null ? `${meeting.stats.propagated} janelas sem mudança reaproveitadas` : undefined} />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <section className="panel p-6">
              <h2 className="font-semibold">Distribuição dos comportamentos</h2>
              <p className="mb-4 text-sm text-slate">Clique numa barra para ver as ocorrências na linha do tempo.</p>
              {metrics.by_category.length
                ? <CategoryBars data={metrics.by_category.map((c) => ({ name: c.name, count: c.count, group: c.group, code: c.code }))}
                    onSelect={(code) => { setCodes(new Set([code])); setTab("linha"); }} />
                : <p className="text-sm text-slate">Nenhuma ocorrência acima do limiar de confiança.</p>}
            </section>
            <section className="panel p-6">
              <h2 className="font-semibold">Concentração ao longo da reunião</h2>
              <p className="mb-4 text-sm text-slate">Ocorrências por minuto. Em cinza, minutos sem imagem analisável. Linhas tracejadas são marcos.</p>
              <DensityChart data={metrics.per_minute} markers={props.markers} onSelect={(ms) => { setTab("linha"); seek(ms); }} />
            </section>
          </div>

          <section className="panel p-6">
            <h2 className="mb-1 font-semibold">Primeiras ocorrências</h2>
            <p className="mb-3 text-sm text-slate">Ordem cronológica. Abra a linha do tempo para ver todas e revisar.</p>
            <OccList list={filtered.slice(0, 8)} catById={catById} partById={partById} onPick={go} selectedId={null} />
          </section>
          <UsageNotice />
          {props.canAdmin && <div className="pt-2"><DeleteMeetingButton meetingId={meeting.id} /></div>}
        </div>
      )}

      {tab === "linha" && (
        <div className="space-y-5">
          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <VideoPanel ref={video} meetingId={meeting.id} available={meeting.video_available} onTime={setCurrent} />
            <Detail o={selected} catById={catById} partById={partById} categories={visualCats} canEdit={props.canEdit}
              onReview={doReview} onClose={() => setSelected(null)} />
          </div>

          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <GroupLegend groups={["expressao", "acao"]} />
              <span className="text-xs text-slate">Listrado = ainda não revisado</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select className="input h-8 w-auto text-xs" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Participante">
                  <option value="todos">Todos os participantes</option>
                  {props.participants.filter((p) => !p.is_host).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
                <select className="input h-8 w-auto text-xs" value={review} onChange={(e) => setReview(e.target.value)} aria-label="Revisão">
                  <option value="todas">Todas, exceto rejeitadas</option>
                  {Object.entries(REVIEW_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="flex items-center gap-2 text-xs text-slate">
                  Confiança ≥ <span className="tabular w-8">{Math.round(minConf * 100)}%</span>
                  <input type="range" min={0} max={0.95} step={0.05} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="accent-[#0f7b7b]" />
                </label>
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {visualCats.filter((c) => c.active || occ.some((o) => o.category_id === c.id)).map((c) => {
                const on = codes.has(c.code);
                return (
                  <button key={c.id} onClick={() => setCodes((s) => { const n = new Set(s); on ? n.delete(c.code) : n.add(c.code); return n; })}
                    className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-slate")}>
                    <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: GROUP_COLOR[c.group_key] }} />{c.name}
                  </button>
                );
              })}
              {codes.size > 0 && <button className="px-2 text-xs font-medium text-lagoa hover:underline" onClick={() => setCodes(new Set())}>Limpar filtro</button>}
            </div>
            <div className="overflow-x-auto"><div className="min-w-[720px]">
              <Timeline duration={meeting.duration_ms} participants={props.participants} occurrences={filtered} categories={props.categories}
                markers={props.markers} current={current} selectedId={selected?.id ?? null} onSelect={go} onSeek={seek} />
            </div></div>
            {props.canEdit && <MarkerBar meetingId={meeting.id} current={current} markers={props.markers} onSeek={seek} onChange={() => router.refresh()} />}
          </section>

          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Ocorrências <span className="tabular font-normal text-slate">({filtered.length})</span></h2>
              {props.canEdit && <ManualAdd meetingId={meeting.id} current={current} participants={props.participants.filter((p) => !p.is_host)} categories={visualCats.filter((c) => c.active)} onDone={() => router.refresh()} />}
            </div>
            <OccList list={filtered} catById={catById} partById={partById} onPick={go} selectedId={selected?.id ?? null} />
          </section>
        </div>
      )}

      {tab === "participantes" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {metrics.participants.map((p) => {
            const mine = occ.filter((o) => o.participant_id === p.participant_id && o.review_status !== "rejeitada");
            const counts = Object.entries(p.by_code).sort((a, b) => b[1] - a[1]);
            const max = Math.max(1, ...counts.map(([, n]) => n));
            const byCode = new Map(props.categories.map((c) => [c.code, c]));
            return (
              <section key={p.participant_id} className="panel p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <span className="size-3 rounded-sm" style={{ background: partById.get(p.participant_id)?.color }} />{p.label}
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Tempo analisado" value={fmtDuration(p.analyzed_ms)} hint={p.no_image_ms ? `${fmtDuration(p.no_image_ms)} sem imagem` : undefined} />
                  <Stat label="Atenção visual aparente" value={p.attention_ratio == null ? "—" : pct(p.attention_ratio)} hint="olhar para a tela / aparência de atenção" />
                  <Stat label="Interações visuais" value={p.interactions} hint={p.interaction_rate_10min != null ? `${p.interaction_rate_10min.toFixed(1).replace(".", ",")} a cada 10 min` : undefined} />
                  <Stat label="Mudanças de expressão" value={p.expression_changes} />
                </div>
                <h3 className="mb-2 mt-6 text-sm font-semibold text-slate">Frequência por comportamento</h3>
                <ul className="space-y-1.5">
                  {counts.map(([code, n]) => {
                    const c = byCode.get(code)!;
                    return (
                      <li key={code} className="grid grid-cols-[minmax(0,1fr)_120px_28px] items-center gap-3 text-sm">
                        <span className="truncate">{c.name}</span>
                        <span className="h-2 rounded-full bg-line-soft"><span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: GROUP_COLOR[c.group_key] }} /></span>
                        <span className="tabular text-right">{n}</span>
                      </li>
                    );
                  })}
                  {!counts.length && <li className="text-sm text-slate">Nenhuma ocorrência.</li>}
                </ul>
                <h3 className="mb-2 mt-6 text-sm font-semibold text-slate">Histórico de ocorrências</h3>
                <div className="max-h-64 overflow-y-auto">
                  <OccList list={mine} catById={catById} partById={partById} onPick={go} selectedId={null} hideParticipant />
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "relatorio" && (
        <ReportView meetingId={meeting.id} report={props.report} canEdit={props.canEdit} onRegenerated={() => router.refresh()} />
      )}
    </>
  );
}

function OccList({ list, catById, partById, onPick, selectedId, hideParticipant }: {
  list: TOcc[]; catById: Map<string, Category>; partById: Map<string, TPart>; onPick: (o: TOcc) => void; selectedId: string | null; hideParticipant?: boolean;
}) {
  if (!list.length) return <p className="text-sm text-slate">Nenhuma ocorrência com os filtros atuais.</p>;
  return (
    <ul className="divide-y divide-line-soft">
      {list.map((o) => {
        const c = catById.get(o.category_id)!;
        return (
          <li key={o.id}>
            <button onClick={() => onPick(o)} className={clsx("grid w-full grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-x-4 px-2 py-2 text-left text-sm hover:bg-paper/70 sm:grid-cols-[76px_150px_minmax(0,1fr)_auto_auto]", selectedId === o.id && "bg-lagoa-wash/60")}>
              <span className="tabular font-mono text-[13px] text-ink-2">{fmtTime(o.start_ms)}</span>
              {!hideParticipant && <span className="hidden truncate text-slate sm:block">{partById.get(o.participant_id)?.label}</span>}
              {hideParticipant && <span className="hidden sm:block" />}
              <span className="flex min-w-0 items-center gap-2"><span className="size-2 shrink-0 rounded-full" style={{ background: GROUP_COLOR[c.group_key] }} /><span className="truncate font-medium">{c.name}</span></span>
              <span className="hidden sm:block"><ConfidenceBar value={o.confidence} /></span>
              <span className={clsx("text-xs", o.review_status === "pendente" ? "text-mute" : o.review_status === "rejeitada" ? "text-crit" : "text-good")}>
                {o.source === "manual" ? "Manual" : REVIEW_LABEL[o.review_status]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Detail({ o, catById, partById, categories, canEdit, onReview, onClose }: {
  o: TOcc | null; catById: Map<string, Category>; partById: Map<string, TPart>; categories: Category[]; canEdit: boolean;
  onReview: (o: TOcc, action: string, extra?: Record<string, unknown>) => Promise<void>; onClose: () => void;
}) {
  const [frame, setFrame] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fix, setFix] = useState({ category_id: "", start: 0, end: 0, note: "" });

  useEffect(() => {
    setFrame(null); setFixing(false); setErr(null);
    if (o) setFix({ category_id: o.category_id, start: Math.round(o.start_ms / 1000), end: Math.round(o.end_ms / 1000), note: "" });
    if (o?.frame_ref_path) api<{ urls: Record<string, string> }>("/api/frames", { method: "POST", json: { paths: [o.frame_ref_path] } })
      .then((r) => setFrame(r.urls[o.frame_ref_path!] ?? null)).catch(() => {});
  }, [o?.id, o?.frame_ref_path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o) {
    return (
      <aside className="panel flex flex-col justify-center gap-2 p-6 text-sm text-slate">
        <h2 className="text-base font-semibold text-ink">Escolha uma ocorrência</h2>
        Clique numa marca da linha do tempo ou na lista abaixo. O vídeo vai para o trecho e aqui aparecem o quadro de referência e as opções de revisão.
      </aside>
    );
  }
  const c = catById.get(o.category_id)!;
  const run = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try { await onReview(o, action, extra); setFixing(false); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  return (
    <aside className="panel flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="tabular font-mono text-sm text-ink-2">{fmtTime(o.start_ms)} – {fmtTime(o.end_ms)}</div>
          <h2 className="text-lg font-semibold leading-snug">{c.name}</h2>
          <div className="text-sm text-slate">{partById.get(o.participant_id)?.label} · {GROUP_LABEL[c.group_key]}</div>
        </div>
        <button onClick={onClose} className="text-mute hover:text-ink" aria-label="Fechar"><X size={18} /></button>
      </div>
      {frame && /* eslint-disable-next-line @next/next/no-img-element */ <img src={frame} alt="Quadro de referência (recorte do participante)" className="max-h-44 w-fit rounded-md border border-line" />}
      <p className="text-sm leading-relaxed">{o.description}</p>
      <div className="flex items-center gap-3 text-sm"><ConfidenceBar value={o.confidence} /><span className="text-slate">· {o.source === "manual" ? "registro manual" : REVIEW_LABEL[o.review_status]}</span></div>

      {canEdit && !fixing && (
        <div className="mt-auto flex flex-wrap gap-2 border-t border-line-soft pt-4">
          {o.review_status === "pendente" ? (<>
            <button className="btn btn-primary" disabled={busy} onClick={() => run("confirmar")}><Check size={15} />Confirmar</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => setFixing(true)}><Pencil size={14} />Corrigir</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => run("rejeitar")}><X size={15} />Rejeitar</button>
          </>) : (
            <button className="btn btn-ghost" disabled={busy} onClick={() => run("reabrir")}><RotateCcw size={14} />Reabrir revisão</button>
          )}
        </div>
      )}
      {canEdit && fixing && (
        <form className="mt-auto grid gap-3 border-t border-line-soft pt-4" onSubmit={(e) => { e.preventDefault(); run("corrigir", { category_id: fix.category_id, start_ms: fix.start * 1000, end_ms: fix.end * 1000, note: fix.note }); }}>
          <label className="field"><span>Comportamento correto</span>
            <select className="input" value={fix.category_id} onChange={(e) => setFix({ ...fix, category_id: e.target.value })}>
              {categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field"><span>Início (s)</span><input className="input" type="number" min={0} value={fix.start} onChange={(e) => setFix({ ...fix, start: Number(e.target.value) })} /></label>
            <label className="field"><span>Fim (s)</span><input className="input" type="number" min={fix.start} value={fix.end} onChange={(e) => setFix({ ...fix, end: Number(e.target.value) })} /></label>
          </div>
          <label className="field"><span>Nota (opcional)</span><input className="input" value={fix.note} onChange={(e) => setFix({ ...fix, note: e.target.value })} /></label>
          <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>Salvar correção</button><button type="button" className="btn btn-ghost" onClick={() => setFixing(false)}>Cancelar</button></div>
        </form>
      )}
      {err && <p className="text-sm text-crit">{err}</p>}
    </aside>
  );
}

function MarkerBar({ meetingId, current, markers, onSeek, onChange }: { meetingId: string; current: number; markers: Marker[]; onSeek: (ms: number) => void; onChange: () => void }) {
  const [label, setLabel] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4 text-sm">
      <Flag size={15} className="text-ambar" />
      {markers.map((m) => (
        <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-ambar-wash px-2.5 py-0.5 text-xs text-[#6b4700]">
          <button onClick={() => onSeek(m.t_ms)} className="tabular font-mono">{fmtTime(m.t_ms)}</button> {m.label}
          <button aria-label="Remover marco" className="ml-0.5 opacity-60 hover:opacity-100" onClick={async () => { await api(`/api/markers/${m.id}`, { method: "DELETE" }); onChange(); }}><X size={12} /></button>
        </span>
      ))}
      <form className="ml-auto flex gap-2" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        try { await api(`/api/meetings/${meetingId}/markers`, { method: "POST", json: { t_ms: current, label } }); setLabel(""); onChange(); }
        catch (x) { setErr((x as Error).message); }
      }}>
        <input className="input h-8 w-56 text-xs" placeholder={`Marco em ${fmtTime(current)} (ex.: preço)`} value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn btn-ghost h-8 text-xs">Marcar momento</button>
      </form>
      {err && <span className="w-full text-xs text-crit">{err}</span>}
    </div>
  );
}

function ManualAdd({ meetingId, current, participants, categories, onDone }: { meetingId: string; current: number; participants: TPart[]; categories: Category[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ participant_id: participants[0]?.id ?? "", category_id: categories[0]?.id ?? "", start: 0, end: 0, description: "" });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) setF((x) => ({ ...x, start: Math.round(current / 1000), end: Math.round(current / 1000) + 3 })); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return <button className="btn btn-ghost h-8 text-xs" onClick={() => setOpen(true)}><Plus size={14} />Adicionar manualmente</button>;
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      try {
        await api("/api/occurrences", { method: "POST", json: { meeting_id: meetingId, participant_id: f.participant_id, category_id: f.category_id, start_ms: f.start * 1000, end_ms: f.end * 1000, description: f.description || undefined } });
        setOpen(false); onDone();
      } catch (x) { setErr((x as Error).message); }
    }}>
      <select className="input h-8 w-auto text-xs" value={f.participant_id} onChange={(e) => setF({ ...f, participant_id: e.target.value })}>{participants.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      <select className="input h-8 w-auto text-xs" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <input className="input h-8 w-20 text-xs" type="number" aria-label="Início (s)" value={f.start} onChange={(e) => setF({ ...f, start: Number(e.target.value) })} />
      <input className="input h-8 w-20 text-xs" type="number" aria-label="Fim (s)" value={f.end} onChange={(e) => setF({ ...f, end: Number(e.target.value) })} />
      <button className="btn btn-primary h-8 text-xs">Adicionar</button>
      <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => setOpen(false)}>Cancelar</button>
      {err && <span className="w-full text-xs text-crit">{err}</span>}
    </form>
  );
}
