import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { ConsentForm } from "@/components/consent-form";
import { RegionEditor } from "@/components/region-editor";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { loadParticipants } from "@/lib/server/data";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Configurar participantes" };

export default async function Configurar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: m } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
  if (!m) notFound();
  const [participants, { count: consents }] = await Promise.all([
    loadParticipants(supabase, id),
    supabase.from("consent_records").select("id", { count: "exact", head: true }).eq("meeting_id", id),
  ]);

  const frames = (m.preview_frames ?? []) as { path: string; t_ms: number }[];
  let urls: Record<string, string> = {};
  if (frames.length) {
    const { data } = await supabase.storage.from("frames").createSignedUrls(frames.map((f) => f.path), 3600);
    urls = Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
  }

  const back = <Link href={`/reunioes/${id}`} className="hover:text-ink">← {m.title}</Link>;

  if (!frames.length) {
    return (
      <>
        <PageHeader back={back} title="Configurar participantes" actions={<StatusBadge status={m.status} />} />
        {m.status === "erro" ? (
          <Empty title="Não foi possível ler o vídeo">{m.error ?? "Verifique se o arquivo é um vídeo válido e envie novamente."}</Empty>
        ) : (
          <>
            <AutoRefresh every={4000} />
            <Empty title="Preparando os quadros de pré-visualização">
              Estamos lendo a duração e extraindo alguns quadros do vídeo para você marcar as posições dos participantes.
              Esta página atualiza sozinha.
            </Empty>
          </>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader back={back} title="Quem é quem no vídeo"
        subtitle="Desenhe um retângulo sobre cada pessoa e marque qual delas é o host. O host nunca é recortado nem enviado para análise." />
      {!consents && <ConsentForm meetingId={id} />}
      <RegionEditor
        meetingId={id}
        frames={frames.map((f) => ({ url: urls[f.path], t_ms: f.t_ms }))}
        aspect={m.width && m.height ? m.width / m.height : 16 / 9}
        initial={participants}
        initialNoHost={m.no_visible_host}
        hasConsent={(consents ?? 0) > 0}
        alreadyProcessed={["concluida", "erro"].includes(m.status)}
        locked={["na_fila", "processando"].includes(m.status)}
      />
    </>
  );
}
