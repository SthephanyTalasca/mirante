// Teste de ponta a ponta do worker com vídeo real (ffmpeg) e provedor mock.
// Vídeo sintético 1280×720: host = quadrante VERMELHO (sup. esq.), P1 azul em movimento,
// P2 verde estático até 20 s, P3 preto (câmera desligada).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { withDefaults } from "../src/lib/analysis/types";
import { extractFrames, probe } from "../worker/media";
import { analyze, type OccurrenceToSave, type PipelineStore, type WindowRecord } from "../worker/pipeline";
import { mockProvider, type VisionRequest } from "../worker/providers";
import { CATS } from "./fixtures";

const VIDEO = process.env.TEST_VIDEO ?? "/tmp/mtest/meeting.mp4";

function memoryStore() {
  const windows: WindowRecord[] = [];
  let occurrences: OccurrenceToSave[] = [];
  const frames: string[] = [];
  const store: PipelineStore = {
    existingWindows: async () => windows.filter((w) => w.status !== "falhou"),
    saveWindow: async (_m, w) => { windows.push(w); },
    replaceAiOccurrences: async (_m, o) => { occurrences = o; },
    uploadFrame: async (k) => { frames.push(k); return k; },
    setProgress: async () => {},
  };
  return { store, windows, get occurrences() { return occurrences; }, frames };
}

/** Fração de pixels "vermelho host" numa imagem. */
async function redRatio(img: Buffer) {
  const { data, info } = await sharp(img).resize(64, 64, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  let red = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) red++;
  return red / (64 * 64);
}

test("pipeline completo: host nunca é enviado, gating economiza chamadas, consolidação funciona", { skip: !existsSync(VIDEO) }, async () => {
  const info = await probe(VIDEO);
  assert.equal(info.width, 1280);
  const dir = mkdtempSync(path.join(tmpdir(), "mirante-"));
  const frames = await extractFrames(VIDEO, dir, 1);
  assert.ok(frames.length >= 39 && frames.length <= 41, `quadros: ${frames.length}`);

  const sent: VisionRequest[] = [];
  const provider = mockProvider((r) => sent.push(r));
  const mem = memoryStore();
  const full = { start_ms: 0, end_ms: null };
  const participants = [
    { id: "host", label: "Host", is_host: true, regions: [{ x: 0, y: 0, w: 0.5, h: 0.5, ...full }] },
    { id: "p1", label: "Participante 1", is_host: false, regions: [{ x: 0.5, y: 0, w: 0.5, h: 0.5, ...full }] },
    { id: "p2", label: "Participante 2", is_host: false, regions: [{ x: 0, y: 0.5, w: 0.5, h: 0.5, ...full }] },
    { id: "p3", label: "Participante 3", is_host: false, regions: [{ x: 0.5, y: 0.5, w: 0.5, h: 0.5, ...full }] },
  ];
  const settings = withDefaults({ ai_provider: "mock" });

  const stats = await analyze({
    meetingId: "m1", orgId: "o1", frames, frameWidth: 1280, frameHeight: 720,
    participants, categories: CATS, settings, provider, store: mem.store, concurrency: 3,
  });
  console.log(stats);

  // 1) nenhuma imagem enviada contém o quadrante do host
  for (const r of sent) assert.ok((await redRatio(r.image)) < 0.01, "imagem com pixels do host foi enviada");
  assert.ok(sent.length > 0);
  // 2) nenhuma janela/ocorrência do host
  assert.ok(!mem.windows.some((w) => w.participant_id === "host"));
  assert.ok(!mem.occurrences.some((o) => o.participant_id === "host"));
  // 3) câmera desligada não gera chamadas
  assert.ok(mem.windows.filter((w) => w.participant_id === "p3").every((w) => w.status === "sem_imagem"));
  // 4) P2 estático nos primeiros 20 s → janelas propagadas
  assert.ok(mem.windows.some((w) => w.participant_id === "p2" && w.status === "propagada"));
  assert.equal(stats.ai_calls, sent.length);
  assert.ok(stats.ai_calls < stats.windows_total, "gating não economizou nada");
  // 5) ocorrências consolidadas: olhar contínuo vira um bloco por participante, não 1 por janela
  const p1Look = mem.occurrences.filter((o) => o.participant_id === "p1" && o.category_code === "olhando_apresentacao");
  assert.equal(p1Look.length, 1);
  assert.ok(p1Look[0].end_ms - p1Look[0].start_ms >= 39000);
  // 6) abaixo do limiar descartado; descrição com termo emocional neutralizada
  assert.ok(!mem.occurrences.some((o) => o.category_code === "expressao_surpresa"));
  assert.ok(!mem.occurrences.some((o) => /feliz/i.test(o.description)));
  // 7) frames de referência apenas de não-hosts
  assert.ok(mem.frames.length === mem.occurrences.length && mem.frames.every((f) => !f.includes("host")));

  // 8) retomada idempotente: rodar de novo não chama a IA
  const sent2: VisionRequest[] = [];
  const again = await analyze({
    meetingId: "m1", orgId: "o1", frames, frameWidth: 1280, frameHeight: 720,
    participants, categories: CATS, settings, provider: mockProvider((r) => sent2.push(r)), store: mem.store,
  });
  assert.equal(sent2.length, 0);
  assert.equal(again.occurrences, stats.occurrences);

  spawnSync("rm", ["-rf", dir]);
  await sharp(sent[0].image).toFile(path.join(tmpdir(), "mirante-contact-sheet.jpg"));
});
