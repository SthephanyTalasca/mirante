import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireUser } from "@/lib/server/auth";

const ALLOWED = /\.(mp4|mov|webm|mkv|m4v)$/i;

/** Cria a reunião e devolve uma URL assinada para envio direto do vídeo ao Storage. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user, profile } = await requireUser(["admin", "analista"]);
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const fileName = String(body.file_name ?? "");
    if (!title) throw new HttpError(400, "Dê um título à reunião.");
    if (!ALLOWED.test(fileName)) throw new HttpError(400, "Envie um vídeo MP4, MOV, WEBM, MKV ou M4V.");

    const { data: meeting, error } = await supabase.from("meetings").insert({
      org_id: profile.org_id, title, created_by: user.id,
      meeting_type: body.meeting_type ?? "reuniao",
      recorded_at: body.recorded_at || null,
    }).select().single();
    if (error) throw error;

    const ext = fileName.split(".").pop()!.toLowerCase();
    const path = `${profile.org_id}/${meeting.id}/gravacao.${ext}`;
    const { data: up, error: upErr } = await supabase.storage.from("recordings").createSignedUploadUrl(path);
    if (upErr) throw upErr;
    await supabase.from("meetings").update({ video_path: path }).eq("id", meeting.id);
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "criou_reuniao", "meeting", meeting.id);

    return NextResponse.json({ meeting, upload: { path, token: up.token } });
  });
}
