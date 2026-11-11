import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireUser } from "@/lib/server/auth";

/** Revisão humana: confirmar, corrigir (categoria/tempos) ou rejeitar. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin", "analista", "revisor"]);
    const b = await req.json();
    const { data: cur } = await supabase.from("occurrences").select("*").eq("id", id).maybeSingle();
    if (!cur) throw new HttpError(404, "Ocorrência não encontrada.");

    const patch: Record<string, unknown> = { reviewed_by: user.id, reviewed_at: new Date().toISOString(), review_note: b.note ?? null };
    if (b.action === "confirmar") patch.review_status = "confirmada";
    else if (b.action === "rejeitar") patch.review_status = "rejeitada";
    else if (b.action === "reabrir") { patch.review_status = "pendente"; patch.reviewed_by = null; patch.reviewed_at = null; }
    else if (b.action === "corrigir") {
      patch.review_status = "corrigida";
      if (b.category_id && b.category_id !== cur.category_id) {
        patch.category_id = b.category_id;
        patch.original_category_id = cur.original_category_id ?? cur.category_id;
      }
      if (b.start_ms != null) patch.start_ms = Math.max(0, Math.round(b.start_ms));
      if (b.end_ms != null) patch.end_ms = Math.round(b.end_ms);
      if (typeof b.description === "string" && b.description.trim()) patch.description = b.description.trim().slice(0, 280);
    } else throw new HttpError(400, "Ação de revisão desconhecida.");

    const { data, error } = await supabase.from("occurrences").update(patch).eq("id", id).select().single();
    if (error) throw new HttpError(400, error.message);
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, `revisao_${b.action}`, "occurrence", id);
    return NextResponse.json(data);
  });
}
