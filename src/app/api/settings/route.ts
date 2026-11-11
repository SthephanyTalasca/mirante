import { NextResponse } from "next/server";
import { audit, handle, HttpError, requireUser } from "@/lib/server/auth";
import { withDefaults } from "@/lib/analysis/types";

const clamp = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Number(v)));

export async function PATCH(req: Request) {
  return handle(async () => {
    const { supabase, user, profile } = await requireUser(["admin"]);
    const b = await req.json();
    const { data: org } = await supabase.from("organizations").select("name,settings").eq("id", profile.org_id).single();
    const s = withDefaults(org?.settings);
    if (b.min_confidence !== undefined) s.min_confidence = clamp(b.min_confidence, 0.3, 0.99);
    if (b.sample_fps !== undefined) s.sample_fps = [0.5, 1, 2].includes(Number(b.sample_fps)) ? Number(b.sample_fps) : 1;
    if (b.window_seconds !== undefined) s.window_seconds = clamp(b.window_seconds, 4, 16);
    if (b.retention_video_days !== undefined) s.retention_video_days = clamp(b.retention_video_days, 1, 365);
    if (b.retention_frames_days !== undefined) s.retention_frames_days = clamp(b.retention_frames_days, 1, 365);
    if (b.store_reference_frames !== undefined) s.store_reference_frames = !!b.store_reference_frames;
    if (b.ai_provider !== undefined) {
      if (!["anthropic", "openai", "mock"].includes(b.ai_provider)) throw new HttpError(400, "Provedor inválido.");
      s.ai_provider = b.ai_provider;
    }
    if (b.ai_model !== undefined) s.ai_model = String(b.ai_model).trim() || null;
    if (b.consent_policy_version !== undefined) s.consent_policy_version = String(b.consent_policy_version).slice(0, 20) || "v1";
    const patch: Record<string, unknown> = { settings: s };
    if (typeof b.org_name === "string" && b.org_name.trim()) patch.name = b.org_name.trim();
    const { error } = await supabase.from("organizations").update(patch).eq("id", profile.org_id);
    if (error) throw error;
    await audit(supabase, { org_id: profile.org_id, actor: user.id }, "alterou_configuracoes", "organization", profile.org_id, s as unknown as Record<string, unknown>);
    return NextResponse.json({ settings: s });
  });
}
