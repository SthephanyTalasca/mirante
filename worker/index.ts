// Worker de processamento de vídeo do Mirante.
// Uso: npm run worker   (precisa de ffmpeg/ffprobe no PATH e das variáveis do .env)
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateReport, loadCategories, loadOrgSettings, loadParticipants, runRetention } from "../src/lib/server/data";
import { frameSize } from "./imaging";
import { extractFrames, previewFrames, probe } from "./media";
import { analyze } from "./pipeline";
import { providerFromEnv } from "./providers";
import { downloadToFile, supabaseStore } from "./store-supabase";

const WORKER_ID = `${hostname()}-${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 4000);
const CONCURRENCY = Number(process.env.AI_CONCURRENCY ?? 4);

const db: SupabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

interface Job { id: string; meeting_id: string; kind: "preview" | "analysis" | "report"; attempts: number; max_attempts: number }

const log = (...a: unknown[]) => console.log(new Date().toISOString(), WORKER_ID, ...a);

async function withTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "mirante-"));
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

async function getMeeting(id: string) {
  const { data, error } = await db.from("meetings").select("*").eq("id", id).single();
  if (error) throw error;
  if (!data.video_path || data.video_deleted_at) throw new Error("Vídeo indisponível (excluído pela retenção?)");
  return data;
}

async function runPreview(job: Job) {
  const m = await getMeeting(job.meeting_id);
  await withTemp(async (dir) => {
    const file = path.join(dir, "video");
    await downloadToFile(db, "recordings", m.video_path, file);
    const info = await probe(file);
    const frames = await previewFrames(file, dir, info.duration_ms);
    const stored: { path: string; t_ms: number }[] = [];
    for (const f of frames) {
      const key = `${m.org_id}/${m.id}/preview_${f.index}.jpg`;
      const { error } = await db.storage.from("frames").upload(key, await readFile(f.path), { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      stored.push({ path: key, t_ms: f.t_ms });
    }
    await db.from("meetings").update({
      duration_ms: info.duration_ms, width: info.width, height: info.height, fps: info.fps,
      preview_frames: stored, status: "aguardando_configuracao", progress: 0, error: null,
    }).eq("id", m.id);
  });
}

async function runAnalysis(job: Job) {
  const m = await getMeeting(job.meeting_id);
  const [settings, categories, participants] = await Promise.all([
    loadOrgSettings(db, m.org_id), loadCategories(db, m.org_id), loadParticipants(db, m.id),
  ]);
  await db.from("meetings").update({ status: "processando", progress: 1, error: null, settings_snapshot: settings }).eq("id", m.id);

  const stats = await withTemp(async (dir) => {
    const file = path.join(dir, "video");
    await downloadToFile(db, "recordings", m.video_path, file);
    const info = await probe(file);
    const framesDir = path.join(dir, "frames");
    await mkdir(framesDir);
    const frames = await extractFrames(file, framesDir, settings.sample_fps);
    const { width, height } = await frameSize(frames[0].path);
    log(`reunião ${m.id}: ${frames.length} quadros ${width}x${height}, ${participants.filter((p) => !p.is_host).length} participante(s) não-host`);

    return analyze({
      meetingId: m.id, orgId: m.org_id, frames, frameWidth: width, frameHeight: height,
      participants, categories, settings,
      provider: providerFromEnv(settings.ai_provider, settings.ai_model),
      store: supabaseStore(db, categories), concurrency: CONCURRENCY,
    }).then((s) => ({ ...s, duration_ms: info.duration_ms }));
  });

  await generateReport(db, m.id);
  await db.from("meetings").update({
    status: "concluida", progress: 100, processed_at: new Date().toISOString(),
    duration_ms: m.duration_ms ?? stats.duration_ms, stats,
  }).eq("id", m.id);
  log(`reunião ${m.id} concluída`, stats);
}

async function handle(job: Job) {
  log(`job ${job.kind} ${job.id} (tentativa ${job.attempts})`);
  try {
    if (job.kind === "preview") await runPreview(job);
    else if (job.kind === "analysis") await runAnalysis(job);
    else await generateReport(db, job.meeting_id);
    await db.from("processing_jobs").update({ status: "done", finished_at: new Date().toISOString(), error: null }).eq("id", job.id);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    log(`job ${job.id} falhou: ${msg}`);
    const final = job.attempts >= job.max_attempts;
    await db.from("processing_jobs").update({
      status: final ? "failed" : "queued", error: msg, locked_at: null, locked_by: null,
      run_after: new Date(Date.now() + 30_000 * 2 ** job.attempts).toISOString(),
    }).eq("id", job.id);
    if (final) await db.from("meetings").update({ status: "erro", error: msg }).eq("id", job.meeting_id);
  }
}

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  log("worker iniciado");
  let lastRetention = 0;
  while (!stopping) {
    if (Date.now() - lastRetention > 3_600_000) {
      lastRetention = Date.now();
      runRetention(db).then((r) => log("retenção", r)).catch((e) => log("retenção falhou", e.message));
    }
    const { data, error } = await db.rpc("claim_job", { p_worker: WORKER_ID });
    if (error) { log("claim_job falhou", error.message); await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    const job = (data as Job[] | null)?.[0];
    if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    await handle(job);
  }
  log("worker encerrado");
}

main();
