import { NextResponse } from "next/server";
import { handle, requireMeeting, requireUser } from "@/lib/server/auth";
import { generateReport } from "@/lib/server/data";
import { supabaseAdmin } from "@/lib/supabase/server";

/** Gera nova versão do relatório (ex.: depois da revisão humana). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser(["admin", "analista", "revisor"]);
    await requireMeeting(supabase, id); // confirma acesso via RLS antes de usar a service role
    const r = await generateReport(supabaseAdmin(), id);
    return NextResponse.json(r);
  });
}
