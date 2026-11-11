import { handle, requireMeeting, requireUser } from "@/lib/server/auth";
import { fmtTime } from "@/lib/analysis/format";

/** Exporta as ocorrências em CSV (Excel/Sheets). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();
    const m = await requireMeeting(supabase, id);
    const { data } = await supabase.from("occurrences")
      .select("start_ms,end_ms,duration_ms,confidence,description,review_status,source,participants(label),behavior_categories!occurrences_category_id_fkey(name)")
      .eq("meeting_id", id).order("start_ms");
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["inicio", "fim", "duracao_s", "participante", "comportamento", "descricao", "confianca", "revisao", "origem"]];
    for (const o of (data ?? []) as any[]) {
      rows.push([fmtTime(o.start_ms), fmtTime(o.end_ms), String(Math.round(o.duration_ms / 1000)), o.participants?.label,
        o.behavior_categories?.name, o.description, String(o.confidence).replace(".", ","), o.review_status, o.source]);
    }
    const csv = "﻿" + rows.map((r) => r.map(esc).join(";")).join("\n");
    const name = m.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 50);
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="mirante-${name}.csv"` } });
  });
}
