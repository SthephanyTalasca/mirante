import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "../src/lib/analysis/types";
import type { OccurrenceToSave, PipelineStore, WindowRecord } from "./pipeline";

export function supabaseStore(db: SupabaseClient, categories: Category[]): PipelineStore {
  const catId = new Map(categories.map((c) => [c.code, c.id]));
  return {
    async existingWindows(meetingId) {
      const { data, error } = await db.from("analysis_windows")
        .select("participant_id,start_ms,end_ms,frame_count,status,raw_response").eq("meeting_id", meetingId);
      if (error) throw error;
      return (data ?? []) as WindowRecord[];
    },

    async saveWindow(meetingId, w) {
      const { error } = await db.from("analysis_windows").upsert({
        meeting_id: meetingId, participant_id: w.participant_id, start_ms: w.start_ms, end_ms: w.end_ms,
        frame_count: w.frame_count, status: w.status, model: w.model ?? null,
        input_tokens: w.input_tokens ?? null, output_tokens: w.output_tokens ?? null, cost_usd: w.cost_usd ?? null,
        raw_response: w.raw_response ?? null,
      }, { onConflict: "meeting_id,participant_id,start_ms" });
      if (error) throw error;
    },

    /** Substitui as ocorrências da IA ainda não revisadas. Revisões humanas são preservadas. */
    async replaceAiOccurrences(meetingId, occ: OccurrenceToSave[]) {
      const del = await db.from("occurrences").delete()
        .eq("meeting_id", meetingId).eq("source", "ia").eq("review_status", "pendente");
      if (del.error) throw del.error;

      const { data: kept } = await db.from("occurrences")
        .select("participant_id,category_id,original_category_id,start_ms,end_ms").eq("meeting_id", meetingId);
      const overlapsReviewed = (o: OccurrenceToSave) => (kept ?? []).some((k: any) =>
        k.participant_id === o.participant_id &&
        (k.category_id === catId.get(o.category_code) || k.original_category_id === catId.get(o.category_code)) &&
        k.start_ms < o.end_ms && o.start_ms < k.end_ms);

      const rows = occ.filter((o) => !overlapsReviewed(o)).map((o) => ({
        meeting_id: meetingId, participant_id: o.participant_id, category_id: o.category_id,
        description: o.description, start_ms: o.start_ms, end_ms: o.end_ms, confidence: o.confidence,
        support_frames: o.support_frames, frame_ref_path: o.frame_ref_path, source: "ia",
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db.from("occurrences").insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
    },

    async uploadFrame(key, jpeg) {
      const { error } = await db.storage.from("frames").upload(key, jpeg, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      return key;
    },

    async setProgress(meetingId, progress) {
      await db.from("meetings").update({ progress }).eq("id", meetingId);
    },
  };
}

/** Baixa um objeto grande do Storage em streaming (não carrega o vídeo inteiro na memória). */
export async function downloadToFile(db: SupabaseClient, bucket: string, objectPath: string, dest: string) {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(objectPath, 3600);
  if (error || !data) throw error ?? new Error("Sem URL assinada");
  const res = await fetch(data.signedUrl);
  if (!res.ok || !res.body) throw new Error(`Download falhou: ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
}
