import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} saiu com ${code}: ${err.slice(-800)}`))));
  });
}

export interface VideoInfo { duration_ms: number; width: number; height: number; fps: number }

export async function probe(file: string): Promise<VideoInfo> {
  const json = JSON.parse(await run("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file,
  ]));
  const s = json.streams?.[0];
  if (!s) throw new Error("Arquivo sem trilha de vídeo");
  const [num, den] = String(s.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    duration_ms: Math.round(Number(json.format?.duration ?? 0) * 1000),
    width: s.width, height: s.height,
    fps: den ? Math.round((num / den) * 100) / 100 : 0,
  };
}

export interface ExtractedFrame { path: string; t_ms: number; index: number }

/**
 * Extrai quadros a `fps` por segundo, redimensionados para `width` px de largura.
 * O quadro i corresponde a t = i / fps.
 */
export async function extractFrames(file: string, outDir: string, fps: number, width = 1280): Promise<ExtractedFrame[]> {
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", file,
    "-vf", `fps=${fps},scale='min(${width},iw)':-2`,
    "-q:v", "3", path.join(outDir, "f_%07d.jpg"),
  ]);
  const files = (await readdir(outDir)).filter((f) => f.startsWith("f_") && f.endsWith(".jpg")).sort();
  const step = 1000 / fps;
  return files.map((f, i) => ({ path: path.join(outDir, f), t_ms: Math.round(i * step), index: i }));
}

/** Quadros de pré-visualização para o usuário marcar regiões e o host. */
export async function previewFrames(file: string, outDir: string, durationMs: number, count = 6): Promise<ExtractedFrame[]> {
  const out: ExtractedFrame[] = [];
  for (let i = 0; i < count; i++) {
    const t = Math.round((durationMs * (i + 0.5)) / count);
    const p = path.join(outDir, `preview_${i}.jpg`);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", (t / 1000).toFixed(3), "-i", file,
      "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", "-y", p]);
    out.push({ path: p, t_ms: t, index: i });
  }
  return out;
}
