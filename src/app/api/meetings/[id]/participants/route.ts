import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

interface InRegion { x: number; y: number; w: number; h: number; start_ms?: number; end_ms?: number | null }
interface InParticipant { label: string; is_host: boolean; color?: string; regions: InRegion[] }

/**
 * Substitui participantes e regiões. Regras: exatamente um host (ou "sem host visível"),
 * rótulos livres (sem reconhecimento facial), regiões dentro do quadro.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin", "analista"]);
    const m = await requireMeeting(supabase, id);
    if (["processando", "na_fila"].includes(m.status)) throw new HttpError(409, "Aguarde o processamento terminar para alterar os participantes.");

    const b = await req.json() as { no_visible_host: boolean; participants: InParticipant[] };
    const list = Array.isArray(b.participants) ? b.participants : [];
    const hosts = list.filter((p) => p.is_host).length;
    if (b.no_visible_host && hosts > 0) throw new HttpError(400, "Você marcou um host e também 'sem host visível'. Escolha um dos dois.");
    if (!b.no_visible_host && hosts !== 1) throw new HttpError(400, "Selecione exatamente um host.");
    if (!list.some((p) => !p.is_host)) throw new HttpError(400, "Defina ao menos um participante para análise.");
    for (const p of list) {
      if (!p.label?.trim()) throw new HttpError(400, "Todo participante precisa de um rótulo.");
      for (const r of p.regions ?? []) {
        if (!(r.x >= 0 && r.y >= 0 && r.w > 0.02 && r.h > 0.02 && r.x + r.w <= 1.0001 && r.y + r.h <= 1.0001))
          throw new HttpError(400, `Região inválida para ${p.label}.`);
      }
    }

    const del = await supabase.from("participants").delete().eq("meeting_id", id);
    if (del.error) throw del.error;
    for (const [i, p] of list.entries()) {
      const { data: row, error } = await supabase.from("participants")
        .insert({ meeting_id: id, label: p.label.trim().slice(0, 60), is_host: p.is_host, color: p.color ?? "#94A3B8", sort_order: i })
        .select("id").single();
      if (error) throw error;
      if (p.regions?.length) {
        const { error: rErr } = await supabase.from("participant_regions").insert(p.regions.map((r) => ({
          participant_id: row.id, x: r.x, y: r.y, w: Math.min(r.w, 1 - r.x), h: Math.min(r.h, 1 - r.y),
          start_ms: r.start_ms ?? 0, end_ms: r.end_ms ?? null,
        })));
        if (rErr) throw rErr;
      }
    }
    await supabase.from("meetings").update({ no_visible_host: !!b.no_visible_host }).eq("id", id);
    // dados antigos ficam inválidos: as janelas eram de participantes que foram recriados (cascade)
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "definiu_participantes", "meeting", id, {
      participants: list.length, host: b.no_visible_host ? "sem host visível" : list.find((p) => p.is_host)?.label,
    });
    return NextResponse.json({ ok: true });
  });
}
