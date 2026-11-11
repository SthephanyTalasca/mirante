import { NextResponse } from "next/server";
import { handle, HttpError, requireMeeting, requireUser } from "@/lib/server/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireUser(["admin", "analista", "revisor"]);
    await requireMeeting(supabase, id);
    const b = await req.json();
    const t = Math.round(Number(b.t_ms));
    if (!Number.isFinite(t) || t < 0) throw new HttpError(400, "Informe o momento do marco.");
    if (!String(b.label ?? "").trim()) throw new HttpError(400, "Descreva o marco (ex.: apresentação do preço).");
    const { data, error } = await supabase.from("meeting_markers")
      .insert({ meeting_id: id, t_ms: t, label: String(b.label).trim().slice(0, 80), created_by: user.id }).select().single();
    if (error) throw error;
    return NextResponse.json(data);
  });
}
