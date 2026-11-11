import { NextResponse } from "next/server";
import { handle, HttpError, requireUser } from "@/lib/server/auth";

/** URLs assinadas para frames (pré-visualização e referência). Só caminhos da própria organização. */
export async function POST(req: Request) {
  return handle(async () => {
    const { supabase, profile } = await requireUser();
    const { paths } = await req.json() as { paths: string[] };
    if (!Array.isArray(paths) || paths.length > 200) throw new HttpError(400, "Lista de frames inválida.");
    const mine = paths.filter((p) => typeof p === "string" && p.startsWith(`${profile.org_id}/`));
    if (!mine.length) return NextResponse.json({ urls: {} });
    const { data, error } = await supabase.storage.from("frames").createSignedUrls(mine, 600);
    if (error) throw error;
    return NextResponse.json({ urls: Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl])) });
  });
}
