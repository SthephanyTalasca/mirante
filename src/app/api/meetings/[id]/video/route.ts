import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

/** URL assinada de 10 minutos para assistir ao trecho. Cada acesso fica na auditoria. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser();
    const m = await requireMeeting(supabase, id);
    if (!m.video_path || m.video_deleted_at) throw new HttpError(410, "O vídeo foi excluído pela política de retenção.");
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(m.video_path, 600);
    if (error) throw error;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "assistiu_video", "meeting", id);
    return NextResponse.json({ url: data.signedUrl });
  });
}
