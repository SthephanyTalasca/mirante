import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

/** Coloca a reunião na fila. O banco recusa se faltar consentimento, host ou participantes. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin", "analista"]);
    const m = await requireMeeting(supabase, id);
    if (["na_fila", "processando"].includes(m.status)) throw new HttpError(409, "Esta reunião já está sendo processada.");
    if (!m.video_path || m.video_deleted_at) throw new HttpError(400, "O vídeo desta reunião não está mais disponível.");

    const { error } = await supabase.from("meetings").update({ status: "na_fila", progress: 0, error: null }).eq("id", id);
    if (error) throw new HttpError(400, error.message);
    const { error: jErr } = await supabase.from("processing_jobs").insert({ meeting_id: id, kind: "analysis" });
    if (jErr) throw jErr;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "iniciou_processamento", "meeting", id);
    return NextResponse.json({ ok: true });
  });
}
