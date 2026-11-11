import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

const METHODS = ["aviso_na_gravacao", "termo_assinado", "aceite_na_plataforma", "outro"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin", "analista"]);
    await requireMeeting(supabase, id);
    const b = await req.json();
    if (!METHODS.includes(b.method)) throw new HttpError(400, "Escolha como os participantes foram informados.");
    if (b.confirm !== true) throw new HttpError(400, "Confirme que os participantes foram informados da análise.");
    const { data: org } = await supabase.from("organizations").select("settings").eq("id", profile.org_id).single();
    const { error } = await supabase.from("consent_records").insert({
      meeting_id: id, method: b.method, notes: b.notes ?? null, attested_by: user.id,
      policy_version: org?.settings?.consent_policy_version ?? "v1",
    });
    if (error) throw error;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "registrou_consentimento", "meeting", id, { method: b.method });
    return NextResponse.json({ ok: true });
  });
}
