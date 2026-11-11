import { NextResponse } from "next/server";
import { supabaseServer } from "../supabase/server";

export type Role = "admin" | "analista" | "revisor" | "leitor";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUser(roles?: Role[]) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Faça login para continuar.");
  const { data: profile } = await supabase.from("profiles").select("id,org_id,full_name,role").eq("id", user.id).single();
  if (!profile) throw new HttpError(403, "Seu usuário não está vinculado a uma organização.");
  if (roles && !roles.includes(profile.role)) throw new HttpError(403, "Seu perfil não tem permissão para esta ação.");
  return { supabase, user, profile: profile as { id: string; org_id: string; full_name: string | null; role: Role } };
}

/** Confere (via RLS) que a reunião pertence à organização do usuário. */
export async function requireMeeting(supabase: Awaited<ReturnType<typeof supabaseServer>>, id: string) {
  const { data } = await supabase.from("meetings").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Reunião não encontrada.");
  return data;
}

export function handle(fn: () => Promise<Response>) {
  return fn().catch((e) => {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = (e as { message?: string }).message ?? "Erro inesperado.";
    console.error(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  });
}

export async function audit(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  p: { org_id: string; actor: string },
  action: string, entity: string, entity_id: string | null, details: Record<string, unknown> = {},
) {
  await supabase.from("audit_logs").insert({ org_id: p.org_id, actor: p.actor, action, entity, entity_id, details });
}
