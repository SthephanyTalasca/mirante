import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/server/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser(["admin", "analista", "revisor"]);
    const { error } = await supabase.from("meeting_markers").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  });
}
