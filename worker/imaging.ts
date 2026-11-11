import sharp, { type OverlayOptions } from "sharp";
import { fmtTime } from "../src/lib/analysis/format";

export interface PixelBox { left: number; top: number; width: number; height: number }

export async function frameSize(file: string) {
  const m = await sharp(file).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

/** Recorta apenas a região do participante. Nada fora dela sai daqui. */
export async function crop(file: string, box: PixelBox, maxSide = 384): Promise<Buffer> {
  return sharp(file)
    .extract(box)
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/** Assinatura 16×16 em tons de cinza: base do gating de movimento e da detecção de câmera desligada. */
export async function signature(img: Buffer): Promise<Uint8Array> {
  const { data } = await sharp(img).resize(16, 16, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

/** Diferença média absoluta (0–255) entre duas assinaturas. */
export function sigDiff(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** Desvio padrão (0–255). Valores muito baixos = quadro uniforme (câmera desligada/tela preta). */
export function sigStd(a: Uint8Array): number {
  let mean = 0;
  for (const v of a) mean += v;
  mean /= a.length;
  let varSum = 0;
  for (const v of a) varSum += (v - mean) ** 2;
  return Math.sqrt(varSum / a.length);
}

const TILE_W = 320, TILE_H = 240, LABEL_H = 22;

/** Monta a folha de contato: grade de quadros com número e horário. */
export async function contactSheet(tiles: Buffer[], times: number[], columns = 4): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / columns);
  const W = columns * TILE_W, H = rows * (TILE_H + LABEL_H);
  const composites: OverlayOptions[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const c = i % columns, r = Math.floor(i / columns);
    const x = c * TILE_W, y = r * (TILE_H + LABEL_H);
    const img = await sharp(tiles[i])
      .resize(TILE_W, TILE_H, { fit: "contain", background: { r: 17, g: 17, b: 17 } })
      .toBuffer();
    composites.push({ input: img, left: x, top: y + LABEL_H });
    const label = Buffer.from(
      `<svg width="${TILE_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="100%" height="100%" fill="#0b0d12"/>` +
      `<text x="8" y="16" font-family="DejaVu Sans Mono, monospace" font-size="14" fill="#ffffff">#${i}  ${fmtTime(times[i])}</text></svg>`,
    );
    composites.push({ input: label, left: x, top: y });
  }

  return sharp({ create: { width: W, height: H, channels: 3, background: { r: 11, g: 13, b: 18 } } })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toBuffer();
}
