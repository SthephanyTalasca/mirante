import { NextResponse } from "next/server";
import { audit, handle, requireMeeting, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Exclusão completa: vídeo, frames, ocorrências, relatórios. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, profile } = await requireUser(["admin"]);
    const m = await requireMeeting(supabase, id);
    const admin = supabaseAdmin();
    if (m.video_path) await admin.storage.from("recordings").remove([m.video_path]);
    const prefix = `${m.org_id}/${m.id}`;
    const { data: files } = await admin.storage.from("frames").list(prefix, { limit: 1000 });
    if (files?.length) await admin.storage.from("frames").remove(files.map((f) => `${prefix}/${f.name}`));
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) throw error;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "excluiu_reuniao", "meeting", id, { title: m.title });
    return NextResponse.json({ ok: true });
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser(["admin", "analista"]);
    await requireMeeting(supabase, id);
    const b = await req.json();
    const patch: Record<string, unknown> = {};
    if (typeof b.title === "string" && b.title.trim()) patch.title = b.title.trim();
    if (typeof b.meeting_type === "string") patch.meeting_type = b.meeting_type;
    const { error } = await supabase.from("meetings").update(patch).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  });
}
