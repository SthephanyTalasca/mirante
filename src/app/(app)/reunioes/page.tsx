import Link from "next/link";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDuration } from "@/lib/analysis/format";
import { supabaseServer } from "@/lib/supabase/server";
import { MEETING_TYPE_LABEL, STATUS_LABEL } from "@/lib/ui";

export const metadata = { title: "Reuniões" };

export default async function Reunioes({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tipo?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  let q = supabase.from("meeting_summary").select("*").order("created_at", { ascending: false }).limit(500);
  if (sp.q) q = q.ilike("title", `%${sp.q}%`);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.tipo) q = q.eq("meeting_type", sp.tipo);
  const { data } = await q;
  const list = data ?? [];

  return (
    <>
      <PageHeader title="Reuniões" subtitle="Histórico de gravações processadas e em andamento."
        actions={<Link href="/reunioes/nova" className="btn btn-primary">Nova análise</Link>} />

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Buscar pelo título" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input w-auto">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="tipo" defaultValue={sp.tipo ?? ""} className="input w-auto">
          <option value="">Todos os tipos</option>
          {Object.entries(MEETING_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-ghost">Filtrar</button>
      </form>

      {!list.length ? (
        <Empty title={sp.q || sp.status || sp.tipo ? "Nenhuma reunião com esses filtros" : "Nenhuma reunião ainda"}
          action={<Link href="/reunioes/nova" className="btn btn-primary">Enviar gravação</Link>} />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-slate">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-medium">Reunião</th>
                <th className="px-3 py-3 font-medium">Tipo</th>
                <th className="px-3 py-3 font-medium">Duração</th>
                <th className="px-3 py-3 text-right font-medium">Participantes</th>
                <th className="px-3 py-3 text-right font-medium">Ocorrências</th>
                <th className="px-3 py-3 text-right font-medium">Revisadas</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {list.map((m) => (
                <tr key={m.id} className="hover:bg-paper/60">
                  <td className="px-5 py-3">
                    <Link href={`/reunioes/${m.id}`} className="font-medium hover:text-lagoa">{m.title}</Link>
                    <div className="text-xs text-mute">{new Date(m.recorded_at ?? m.created_at).toLocaleDateString("pt-BR")}</div>
                  </td>
                  <td className="px-3 py-3 text-slate">{MEETING_TYPE_LABEL[m.meeting_type]}</td>
                  <td className="tabular px-3 py-3 text-slate">{m.duration_ms ? fmtDuration(m.duration_ms) : "—"}</td>
                  <td className="tabular px-3 py-3 text-right">{m.participants_analyzed}</td>
                  <td className="tabular px-3 py-3 text-right">{m.occurrences}</td>
                  <td className="tabular px-3 py-3 text-right">{m.reviewed}</td>
                  <td className="px-5 py-3"><StatusBadge status={m.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
