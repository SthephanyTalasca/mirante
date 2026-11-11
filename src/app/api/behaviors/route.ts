import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireUser } from "@/lib/server/auth";
import { sanitizeBehavior } from "@/lib/server/behaviors";

export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, user, profile } = await requireUser(["admin"]);
    const b = await req.json();
    const code = String(b.code ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (code.length < 2) throw new HttpError(400, "Informe um código (ex.: bracos_cruzados).");
    if (!b.name) throw new HttpError(400, "Informe o nome do comportamento.");
    const { data, error } = await supabase.from("behavior_categories")
      .insert({ ...sanitizeBehavior(b), code, org_id: profile.org_id, detection: "visual" }).select().single();
    if (error) throw new HttpError(400, error.code === "23505" ? "Já existe um comportamento com esse código." : error.message);
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "criou_comportamento", "behavior", data.id, { code });
    return NextResponse.json(data);
  });
}
