import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const ROLES = ["admin", "analista", "revisor", "leitor"];

/** Convida um usuário para a organização (o perfil é criado no primeiro acesso). */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user, profile } = await requireUser(["admin"]);
    const { email, role } = await req.json();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) throw new HttpError(400, "E-mail inválido.");
    if (!ROLES.includes(role)) throw new HttpError(400, "Perfil inválido.");
    const { error } = await supabase.from("org_invites").upsert({ org_id: profile.org_id, email: String(email).toLowerCase(), role, invited_by: user.id }, { onConflict: "org_id,email" });
    if (error) throw error;
    const origin = new URL(req.url).origin;
    const { error: invErr } = await supabaseAdmin().auth.admin.inviteUserByEmail(String(email), { redirectTo: `${origin}/auth/callback` });
    if (invErr && !/already/i.test(invErr.message)) throw new HttpError(400, invErr.message);
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "convidou_usuario", "profile", null, { email, role });
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(req: Request) {
  return handle(async () => {
    const { supabase, user, profile } = await requireUser(["admin"]);
    const { id, role } = await req.json();
    if (!ROLES.includes(role)) throw new HttpError(400, "Perfil inválido.");
    if (id === user.id) throw new HttpError(400, "Você não pode alterar o próprio perfil.");
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id).eq("org_id", profile.org_id);
    if (error) throw error;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "alterou_perfil", "profile", id, { role });
    return NextResponse.json({ ok: true });
  });
}
