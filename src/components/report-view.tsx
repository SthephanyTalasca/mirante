"use client";
import { Printer, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { ReportContent } from "@/lib/analysis/report";
import { api } from "@/lib/ui";

export function ReportView({ meetingId, report, canEdit, onRegenerated }: {
  meetingId: string; report: { version: number; content: ReportContent; created_at: string } | null; canEdit: boolean; onRegenerated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true); setErr(null);
    try { await api(`/api/meetings/${meetingId}/report`, { method: "POST" }); onRegenerated(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  if (!report) {
    return (
      <div className="panel p-8">
        <p className="mb-4 text-slate">O relatório ainda não foi gerado.</p>
        {canEdit && <button className="btn btn-primary" onClick={regenerate} disabled={busy}>Gerar relatório</button>}
      </div>
    );
  }
  const r = report.content;

  return (
    <article className="panel mx-auto max-w-4xl p-8 print:border-0 print:p-0">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-slate">Versão {report.version}, gerada em {new Date(report.created_at).toLocaleString("pt-BR")}</p>
        <div className="flex gap-2">
          {canEdit && <button className="btn btn-ghost" onClick={regenerate} disabled={busy} title="Inclui as revisões feitas desde a última versão"><RefreshCw size={14} />Atualizar com revisões</button>}
          <button className="btn btn-ghost" onClick={() => window.print()}><Printer size={14} />Imprimir ou PDF</button>
        </div>
      </header>
      {err && <p className="mb-4 text-sm text-crit">{err}</p>}

      <p className="text-[1.15rem] font-medium leading-relaxed">{r.headline}</p>
      <p className="mt-4 rounded-md border border-line bg-paper/60 px-4 py-3 text-sm leading-relaxed text-slate">{r.notice}</p>

      <div className="mt-8 space-y-8">
        {r.sections.map((s) => (
          <section key={s.key}>
            <h2 className="mb-2 text-base font-bold tracking-[-0.01em]">{s.title}</h2>
            <ul className="max-w-[72ch] list-disc space-y-1 pl-5 text-[0.95rem] leading-relaxed marker:text-mute">
              {s.items.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="mb-3 text-base font-bold tracking-[-0.01em]">Comparativo entre os participantes</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-slate">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Participante</th>
                  <th className="px-3 py-2 font-medium">Tempo analisado</th>
                  <th className="px-3 py-2 text-right font-medium">Ocorrências</th>
                  <th className="px-3 py-2 text-right font-medium">Atenção visual aparente</th>
                  <th className="px-3 py-2 text-right font-medium">Interações</th>
                  <th className="py-2 pl-3 text-right font-medium">Mudanças de expressão</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line-soft">
                {r.comparison.map((c) => (
                  <tr key={c.participant_id}>
                    <td className="py-2 pr-3 font-medium">{c.label}</td>
                    <td className="px-3 py-2">{c.analyzed}</td>
                    <td className="px-3 py-2 text-right">{c.occurrences}</td>
                    <td className="px-3 py-2 text-right">{c.attention}</td>
                    <td className="px-3 py-2 text-right">{c.interactions}</td>
                    <td className="py-2 pl-3 text-right">{c.expression_changes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-mute">O comparativo mostra frequências de sinais visuais. Não é uma classificação de pessoas.</p>
        </section>
      </div>
    </article>
  );
}
