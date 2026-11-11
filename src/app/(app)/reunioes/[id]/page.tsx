import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { MeetingDashboard } from "@/components/meeting-dashboard";
import { RetryButton } from "@/components/meeting-actions";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDuration } from "@/lib/analysis/format";
import { metricsFromBundle, loadMeetingBundle } from "@/lib/server/data";
import { supabaseServer } from "@/lib/supabase/server";
import { MEETING_TYPE_LABEL } from "@/lib/ui";

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: exists } = await supabase.from("meetings").select("id,status,preview_frames").eq("id", id).maybeSingle();
  if (!exists) notFound();
  if (["rascunho", "aguardando_configuracao"].includes(exists.status)) redirect(`/reunioes/${id}/configurar`);

  const bundle = await loadMeetingBundle(supabase, id);
  const m = bundle.meeting;
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const back = <Link href="/reunioes" className="hover:text-ink">← Reuniões</Link>;
  const subtitle = `${MEETING_TYPE_LABEL[m.meeting_type]}${m.duration_ms ? ` · ${fmtDuration(m.duration_ms)}` : ""}${m.recorded_at ? ` · ${new Date(m.recorded_at).toLocaleDateString("pt-BR")}` : ""}`;

  if (m.status === "na_fila" || m.status === "processando") {
    const s = m.stats ?? {};
    return (
      <>
        <AutoRefresh every={4000} />
        <PageHeader back={back} title={m.title} subtitle={subtitle} actions={<StatusBadge status={m.status} />} />
        <section className="panel max-w-2xl p-6">
          <h2 className="font-semibold">{m.status === "na_fila" ? "Aguardando um processador livre" : "Analisando a gravação"}</h2>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-line-soft"><div className="h-full bg-lagoa transition-[width] duration-700" style={{ width: `${m.progress}%` }} /></div>
          <p className="tabular mt-2 text-sm text-slate">{m.progress}%</p>
          <ol className="mt-5 space-y-1.5 text-sm text-slate">
            <li>1. Extração de quadros do vídeo</li>
            <li>2. Recorte apenas dos participantes (host fica de fora)</li>
            <li>3. Análise em janelas de alguns segundos, pulando trechos sem mudança</li>
            <li>4. Consolidação temporal e relatório</li>
          </ol>
          {s.ai_calls != null && <p className="mt-4 text-xs text-mute">Execução anterior: {s.ai_calls} chamadas à IA.</p>}
        </section>
      </>
    );
  }

  if (m.status === "erro") {
    return (
      <>
        <PageHeader back={back} title={m.title} subtitle={subtitle} actions={<StatusBadge status={m.status} />} />
        <Empty title="O processamento não terminou" action={
          <div className="flex gap-2"><RetryButton meetingId={id} /><Link className="btn btn-ghost" href={`/reunioes/${id}/configurar`}>Revisar participantes</Link></div>
        }>
          {m.error ?? "Erro desconhecido."} As janelas já analisadas são reaproveitadas ao tentar de novo.
        </Empty>
      </>
    );
  }

  const metrics = metricsFromBundle(bundle);
  const { data: report } = await supabase.from("reports").select("version,content,created_at").eq("meeting_id", id)
    .order("version", { ascending: false }).limit(1).maybeSingle();

  return (
    <MeetingDashboard
      meeting={{ id: m.id, title: m.title, subtitle, status: m.status, duration_ms: m.duration_ms ?? 0, video_available: !!m.video_path && !m.video_deleted_at, stats: m.stats ?? {} }}
      participants={bundle.participants.map(({ id, label, is_host, color }) => ({ id, label, is_host, color: color ?? "#94a3b8" }))}
      categories={bundle.categories}
      occurrences={bundle.occurrences.map((o: any) => ({
        id: o.id, participant_id: o.participant_id, category_id: o.category_id, start_ms: o.start_ms, end_ms: o.end_ms,
        confidence: o.confidence, description: o.description, review_status: o.review_status, frame_ref_path: o.frame_ref_path, source: o.source,
      }))}
      markers={bundle.markers}
      metrics={metrics}
      report={report ?? null}
      canEdit={["admin", "analista", "revisor"].includes(profile?.role)}
      canAdmin={profile?.role === "admin"}
    />
  );
}
