import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

/** Ocorrência adicionada manualmente pelo revisor. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user, profile } = await requireUser(["admin", "analista", "revisor"]);
    const b = await req.json();
    await requireMeeting(supabase, b.meeting_id);
    const start = Math.round(Number(b.start_ms)), end = Math.round(Number(b.end_ms ?? b.start_ms));
    if (!(start >= 0 && end >= start)) throw new HttpError(400, "Início e fim inválidos.");
    const { data, error } = await supabase.from("occurrences").insert({
      meeting_id: b.meeting_id, participant_id: b.participant_id, category_id: b.category_id,
      description: String(b.description ?? "Registro manual").slice(0, 280), start_ms: start, end_ms: end,
      confidence: 1, source: "manual", review_status: "confirmada", reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    }).select().single();
    if (error) throw new HttpError(400, error.message);
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "adicionou_ocorrencia", "occurrence", data.id);
    return NextResponse.json(data);
  });
}
