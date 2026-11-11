// Carregamento de dados compartilhado por app (server) e worker. Recebe qualquer SupabaseClient.
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeMetrics } from "../analysis/metrics";
import { buildReport } from "../analysis/report";
import { type Category, type Marker, type OccurrenceRow, type Participant, type WindowCoverage, withDefaults } from "../analysis/types";

export async function loadParticipants(db: SupabaseClient, meetingId: string): Promise<Participant[]> {
  const { data, error } = await db
    .from("participants")
    .select("id,label,is_host,color,sort_order,participant_regions(x,y,w,h,start_ms,end_ms)")
    .eq("meeting_id", meetingId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id, label: p.label, is_host: p.is_host, color: p.color,
    regions: (p.participant_regions ?? []).map((r: any) => ({ x: +r.x, y: +r.y, w: +r.w, h: +r.h, start_ms: r.start_ms, end_ms: r.end_ms })),
  }));
}

export async function loadCategories(db: SupabaseClient, orgId: string): Promise<Category[]> {
  const { data, error } = await db.from("behavior_categories").select("*").eq("org_id", orgId).order("sort_order");
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ ...c, min_confidence: c.min_confidence == null ? null : +c.min_confidence }));
}

export async function loadOrgSettings(db: SupabaseClient, orgId: string) {
  const { data, error } = await db.from("organizations").select("settings").eq("id", orgId).single();
  if (error) throw error;
  return withDefaults(data?.settings);
}

export async function loadMeetingBundle(db: SupabaseClient, meetingId: string) {
  const { data: meeting, error } = await db.from("meetings").select("*").eq("id", meetingId).single();
  if (error) throw error;
  const [participants, categories, occ, win, markers] = await Promise.all([
    loadParticipants(db, meetingId),
    loadCategories(db, meeting.org_id),
    db.from("occurrences").select("*").eq("meeting_id", meetingId).order("start_ms"),
    db.from("analysis_windows").select("participant_id,start_ms,end_ms,status").eq("meeting_id", meetingId),
    db.from("meeting_markers").select("id,t_ms,label").eq("meeting_id", meetingId).order("t_ms"),
  ]);
  return {
    meeting,
    participants,
    categories,
    occurrences: (occ.data ?? []).map((o: any) => ({ ...o, confidence: +o.confidence })) as (OccurrenceRow & Record<string, any>)[],
    coverage: (win.data ?? []) as WindowCoverage[],
    markers: (markers.data ?? []) as Marker[],
  };
}

export function metricsFromBundle(b: Awaited<ReturnType<typeof loadMeetingBundle>>) {
  return computeMetrics({
    duration_ms: b.meeting.duration_ms ?? 0,
    participants: b.participants,
    categories: b.categories,
    occurrences: b.occurrences,
    coverage: b.coverage,
    markers: b.markers,
  });
}

/** Gera e grava uma nova versão do relatório. Requer cliente com permissão de escrita (service role). */
export async function generateReport(admin: SupabaseClient, meetingId: string) {
  const b = await loadMeetingBundle(admin, meetingId);
  const content = buildReport(metricsFromBundle(b), b.participants, b.categories);
  const { data: last } = await admin.from("reports").select("version").eq("meeting_id", meetingId)
    .order("version", { ascending: false }).limit(1).maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { error } = await admin.from("reports").insert({ meeting_id: meetingId, version, content });
  if (error) throw error;
  return { version, content };
}

/** Retenção: apaga vídeos e frames vencidos. Os resultados (ocorrências, relatório) permanecem. */
export async function runRetention(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("media_due_for_deletion");
  if (error) throw error;
  let videos = 0, frameSets = 0;
  for (const row of (data ?? []) as { meeting_id: string; org_id: string; video_path: string | null; kind: string }[]) {
    if (row.kind === "video" && row.video_path) {
      await admin.storage.from("recordings").remove([row.video_path]);
      await admin.from("meetings").update({ video_deleted_at: new Date().toISOString() }).eq("id", row.meeting_id);
      videos++;
    } else if (row.kind === "frames") {
      const prefix = `${row.org_id}/${row.meeting_id}`;
      const { data: files } = await admin.storage.from("frames").list(prefix, { limit: 1000 });
      if (files?.length) await admin.storage.from("frames").remove(files.map((f) => `${prefix}/${f.name}`));
      await admin.from("occurrences").update({ frame_ref_path: null }).eq("meeting_id", row.meeting_id);
      frameSets++;
    }
    await admin.from("audit_logs").insert({ org_id: row.org_id, action: "retencao", entity: "meeting", entity_id: row.meeting_id, details: { kind: row.kind } });
  }
  return { videos, frameSets };
}
