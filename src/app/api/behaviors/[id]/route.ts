import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireUser } from "@/lib/server/auth";
import { sanitizeBehavior } from "@/lib/server/behaviors";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin"]);
    const { data, error } = await supabase.from("behavior_categories").update(sanitizeBehavior(await req.json())).eq("id", id).select().single();
    if (error) throw new HttpError(400, error.message);
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "editou_comportamento", "behavior", id);
    return NextResponse.json(data);
  });
}

/** Se já houver ocorrências, desativa em vez de apagar (preserva o histórico). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin"]);
    const { count } = await supabase.from("occurrences").select("id", { count: "exact", head: true }).or(`category_id.eq.${id},original_category_id.eq.${id}`);
    if ((count ?? 0) > 0) {
      await supabase.from("behavior_categories").update({ active: false }).eq("id", id);
      await audit(supabase, { org_id: profile.org_id, actor: user.id }, "desativou_comportamento", "behavior", id);
      return NextResponse.json({ deactivated: true, message: `Comportamento desativado: há ${count} ocorrência(s) no histórico.` });
    }
    const { error } = await supabase.from("behavior_categories").delete().eq("id", id);
    if (error) throw error;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "excluiu_comportamento", "behavior", id);
    return NextResponse.json({ deleted: true });
  });
}
