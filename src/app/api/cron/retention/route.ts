import { NextResponse } from "next/server";
import { runRetention } from "@/lib/server/data";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  return NextResponse.json(await runRetention(supabaseAdmin()));
}
