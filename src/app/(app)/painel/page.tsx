import Link from "next/link";
import { CategoryBars, MeetingsTrend } from "@/components/charts";
import { Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { fmtDuration, pct } from "@/lib/analysis/format";
import { supabaseServer } from "@/lib/supabase/server";
import { MEETING_TYPE_LABEL } from "@/lib/ui";

export const metadata = { title: "Painel" };

export default async function Painel() {
  const supabase = await supabaseServer();
  const [{ data: meetings }, { data: freq }] = await Promise.all([
    supabase.from("meeting_summary").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("category_frequency").select("code,name,group_key,total"),
  ]);
  const list = meetings ?? [];
  const done = list.filter((m) => m.status === "concluida");

  if (!list.length) {
    return (
      <>
        <PageHeader title="Painel" />
        <Empty title="Nenhuma reunião analisada ainda" action={<Link href="/reunioes/nova" className="btn btn-primary">Enviar a primeira gravação</Link>}>
          Envie uma gravação, marque quem é o host e quem são os participantes, registre o consentimento
          e o Mirante gera a linha do tempo de sinais visuais e o relatório.
        </Empty>
      </>
    );
  }

  const totalOcc = done.reduce((a, m) => a + Number(m.occurrences), 0);
  const totalRev = done.reduce((a, m) => a + Number(m.reviewed), 0);
  const totalPart = done.reduce((a, m) => a + Number(m.participants_analyzed), 0);
  const totalMs = done.reduce((a, m) => a + Number(m.duration_ms ?? 0), 0);

  const agg = new Map<string, { name: string; count: number; group: string; code: string }>();
  for (const f of freq ?? []) {
    const cur = agg.get(f.code) ?? { name: f.name, count: 0, group: f.group_key, code: f.code };
    cur.count += Number(f.total);
    agg.set(f.code, cur);
  }
  const top = [...agg.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const trend = [...done].reverse().slice(-12).map((m, i) => ({
    label: `#${i + 1}`, title: m.title,
    value: Number(m.participants_analyzed) ? Number(m.occurrences) / Number(m.participants_analyzed) : 0,
  }));

  return (
    <>
      <PageHeader title="Painel" subtitle="Visão consolidada das reuniões analisadas pela sua organização." />

      <section className="panel mb-6 grid grid-cols-2 gap-6 p-6 md:grid-cols-4">
        <Stat label="Reuniões analisadas" value={done.length} hint={`${fmtDuration(totalMs)} de gravação`} />
        <Stat label="Participantes analisados" value={totalPart} hint="host excluído em todas" />
        <Stat label="Ocorrências" value={totalOcc.toLocaleString("pt-BR")} />
        <Stat label="Revisadas por pessoas" value={totalOcc ? pct(totalRev / totalOcc) : "—"} />
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <section className="panel p-6">
          <h2 className="font-semibold">Comportamentos mais registrados</h2>
          <p className="mb-4 text-sm text-slate">Todas as reuniões concluídas; rejeitados na revisão não entram.</p>
          {top.length ? <CategoryBars data={top} /> : <p className="text-sm text-slate">Ainda sem ocorrências.</p>}
        </section>
        <section className="panel p-6">
          <h2 className="font-semibold">Ocorrências por participante, por reunião</h2>
          <p className="mb-4 text-sm text-slate">Últimas {trend.length} reuniões concluídas, da mais antiga à mais recente.</p>
          <MeetingsTrend data={trend} />
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-semibold">Reuniões recentes</h2>
          <Link href="/reunioes" className="text-sm font-medium text-lagoa hover:underline">Ver todas</Link>
        </div>
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {list.slice(0, 6).map((m) => (
            <li key={m.id}>
              <Link href={`/reunioes/${m.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3.5 hover:bg-paper/60">
                <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                <span className="text-sm text-slate">{MEETING_TYPE_LABEL[m.meeting_type]}</span>
                <span className="tabular w-28 text-sm text-slate">{m.occurrences} ocorrências</span>
                <StatusBadge status={m.status} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
