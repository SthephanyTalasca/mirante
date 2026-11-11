import { NextResponse } from "next/server";
import { handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

/** Chamado após o envio do vídeo: agenda a pré-visualização (duração + quadros para marcar regiões). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser(["admin", "analista"]);
    const m = await requireMeeting(supabase, id);
    if (!m.video_path) throw new HttpError(400, "Envie o vídeo antes.");
    const { error } = await supabase.from("processing_jobs").insert({ meeting_id: id, kind: "preview" });
    if (error) throw error;
    await supabase.from("meetings").update({ status: "rascunho", progress: 0 }).eq("id", id);
    return NextResponse.json({ ok: true });
  });
}
