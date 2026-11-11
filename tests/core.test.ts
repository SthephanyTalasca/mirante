import assert from "node:assert/strict";
import { test } from "node:test";
import { consolidate, propagate } from "../src/lib/analysis/consolidate";
import { guardText } from "../src/lib/analysis/language-guard";
import { computeMetrics, unionMs } from "../src/lib/analysis/metrics";
import { parseWindowResponse } from "../src/lib/analysis/parse";
import { analyzableParticipants, regionAt, toPixels } from "../src/lib/analysis/regions";
import { buildReport } from "../src/lib/analysis/report";
import { CATS } from "./fixtures";

const cat = (code: string) => CATS.find((c) => c.code === code)!;

test("guarda de linguagem bloqueia diagnósticos e aceita sinais", () => {
  assert.equal(guardText("Parece entediado com a apresentação", "fallback").ok, false);
  assert.equal(guardText("Participante interessado no preço", "fallback").text, "fallback");
  assert.equal(guardText("He looks bored", "x").ok, false);
  assert.equal(guardText("Cantos da boca elevados, olhar para a tela", "x").ok, true);
  assert.equal(guardText("Expressão aparentemente confusa: testa franzida", "x").ok, true);
  assert.equal(guardText("Está confuso", "x").ok, false);
});

test("parse valida códigos, quadros e confiança e converte para tempo absoluto", () => {
  const frameTimes = [8000, 9000, 10000, 11000];
  const r = parseWindowResponse({
    face_visible: true,
    observations: [
      { code: "sorriso", from_frame: 1, to_frame: 2, confidence: 0.8, description: "cantos da boca elevados" },
      { code: "inventado", from_frame: 0, to_frame: 1, confidence: 0.9 },
      { code: "sorriso", from_frame: 0, to_frame: 9, confidence: 1.4 },
      { code: "mexendo_celular", from_frame: 3, to_frame: 1, confidence: 0.7, description: "parece desinteressado" },
    ],
    end_state: "olhar para baixo",
  }, { participantId: "p1", frameTimes, stepMs: 1000, categories: CATS });
  assert.equal(r.observations.length, 2);
  assert.deepEqual([r.observations[0].start_ms, r.observations[0].end_ms], [9000, 11000]);
  assert.deepEqual([r.observations[1].start_ms, r.observations[1].end_ms], [9000, 12000]); // from/to invertidos corrigidos
  assert.equal(r.observations[1].description, cat("mexendo_celular").description); // texto neutralizado
  assert.ok(r.rejected.length >= 3);
});

test("consolidação junta janelas consecutivas e elimina duplicatas", () => {
  const obs = [
    { participant_id: "p1", category_code: "olhando_apresentacao", start_ms: 0, end_ms: 8000, confidence: 0.8, frames: 8, description: "a", ref_t_ms: 4000 },
    { participant_id: "p1", category_code: "olhando_apresentacao", start_ms: 8000, end_ms: 16000, confidence: 0.9, frames: 8, description: "b", ref_t_ms: 12000 },
    { participant_id: "p1", category_code: "olhando_apresentacao", start_ms: 9000, end_ms: 12000, confidence: 0.9, frames: 3, description: "dup", ref_t_ms: 10000 },
    { participant_id: "p1", category_code: "olhando_apresentacao", start_ms: 40000, end_ms: 48000, confidence: 0.85, frames: 8, description: "c", ref_t_ms: 44000 },
  ];
  const r = consolidate(obs, CATS, 0.6);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].start_ms, r[0].end_ms], [0, 16000]);
  assert.equal(r[0].support_frames, 19);
});

test("consolidação aplica min_frames, duração mínima e limiar de confiança", () => {
  const base = { participant_id: "p1", description: "x", ref_t_ms: 0 };
  const r = consolidate([
    { ...base, category_code: "desviando_olhar", start_ms: 0, end_ms: 2000, confidence: 0.9, frames: 2 },   // < 3 quadros
    { ...base, category_code: "sorriso", start_ms: 0, end_ms: 1000, confidence: 0.5, frames: 1 },           // < 0,6
    { ...base, category_code: "expressao_surpresa", start_ms: 5000, end_ms: 6000, confidence: 0.7, frames: 1 }, // ok: pode ser breve
  ], CATS, 0.6);
  assert.deepEqual(r.map((o) => o.category_code), ["expressao_surpresa"]);
});

test("host nunca passa pela consolidação nem pelas regiões analisáveis", () => {
  const parts = [
    { id: "h", label: "Host", is_host: true, regions: [{ x: 0, y: 0, w: 0.5, h: 0.5, start_ms: 0, end_ms: null }] },
    { id: "p1", label: "P1", is_host: false, regions: [{ x: 0.5, y: 0, w: 0.5, h: 0.5, start_ms: 0, end_ms: null }] },
  ];
  assert.deepEqual(analyzableParticipants(parts).map((p) => p.id), ["p1"]);
  const r = consolidate([{ participant_id: "h", category_code: "sorriso", start_ms: 0, end_ms: 2000, confidence: 0.9, frames: 2, description: "", ref_t_ms: 0 }], CATS, 0.6, new Set(["h"]));
  assert.equal(r.length, 0);
});

test("regiões com validade temporal e conversão para pixels", () => {
  const p = { id: "p", label: "P", is_host: false, regions: [
    { x: 0, y: 0, w: 0.5, h: 0.5, start_ms: 0, end_ms: 60000 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5, start_ms: 60000, end_ms: null },
  ] };
  assert.equal(regionAt(p, 59999)!.x, 0);
  assert.equal(regionAt(p, 60000)!.x, 0.5);
  assert.deepEqual(toPixels(regionAt(p, 70000)!, 1280, 720), { left: 640, top: 360, width: 640, height: 360 });
});

test("propagação estende só o que estava ativo no fim da janela anterior", () => {
  const prev = [
    { participant_id: "p", category_code: "olhando_apresentacao", start_ms: 0, end_ms: 8000, confidence: 0.8, frames: 8, description: "", ref_t_ms: 0 },
    { participant_id: "p", category_code: "sorriso", start_ms: 1000, end_ms: 3000, confidence: 0.8, frames: 2, description: "", ref_t_ms: 0 },
  ];
  const r = propagate(prev, { start_ms: 0, end_ms: 8000 }, { start_ms: 8000, end_ms: 16000 });
  assert.deepEqual(r.map((o) => o.category_code), ["olhando_apresentacao"]);
  assert.equal(r[0].frames, 8);
  assert.ok(r[0].propagated);
});

test("métricas e relatório não contêm linguagem bloqueada", () => {
  assert.equal(unionMs([[0, 10], [5, 20], [30, 40]]), 30);
  const parts = [
    { id: "h", label: "Host", is_host: true, regions: [] },
    { id: "p1", label: "Participante 1", is_host: false, regions: [] },
    { id: "p2", label: "Participante 2", is_host: false, regions: [] },
  ];
  const occ = [
    { participant_id: "p1", category_id: cat("olhando_apresentacao").id, start_ms: 0, end_ms: 60000, confidence: 0.8 },
    { participant_id: "p1", category_id: cat("sorriso").id, start_ms: 65000, end_ms: 67000, confidence: 0.8 },
    { participant_id: "p2", category_id: cat("mexendo_celular").id, start_ms: 70000, end_ms: 90000, confidence: 0.8 },
    { participant_id: "p2", category_id: cat("sorriso").id, start_ms: 72000, end_ms: 73000, confidence: 0.8, review_status: "rejeitada" as const },
  ];
  const coverage = ["p1", "p2"].map((id) => ({ participant_id: id, start_ms: 0, end_ms: 120000, status: "analisada" as const }));
  const m = computeMetrics({ duration_ms: 120000, participants: parts, categories: CATS, occurrences: occ, coverage, markers: [{ t_ms: 60000, label: "Apresentação do preço" }] });
  assert.equal(m.total_occurrences, 3);
  assert.equal(m.participants.find((p) => p.participant_id === "p1")!.attention_ratio, 0.5);
  assert.equal(m.marker_reactions[0].occurrences.length, 2);
  const rep = buildReport(m, parts, CATS);
  const text = JSON.stringify(rep.sections);
  assert.ok(!/removida pela guarda/.test(text), text);
  assert.ok(rep.notice.includes("não indica emoções"));
});
