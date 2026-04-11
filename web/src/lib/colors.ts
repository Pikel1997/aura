/**
 * Aura color extraction — chroma²-weighted blend in linear light, with
 * achromatic detection. Direct port of wiz_ambient/video.py. Designed
 * to run on a downsized canvas (~96x96) every ~100ms — well under 1 ms
 * per call.
 */

export type ExtractResult = {
  r: number;
  g: number;
  b: number;
  lum: number; // 0..1
  chroma: number; // 0..1
};

const ACHROMATIC_THRESHOLD = 0.12;

export function extractAuraColor(image: ImageData): ExtractResult {
  const data = image.data;
  const len = data.length / 4;

  let totalLum = 0;
  let totalChromaW = 0;
  let totalLumW = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let weightSum = 0;

  for (let i = 0; i < len; i++) {
    const o = i * 4;
    const r = data[o] / 255;
    const g = data[o + 1] / 255;
    const b = data[o + 2] / 255;

    const rl = Math.pow(r, 2.2);
    const gl = Math.pow(g, 2.2);
    const bl = Math.pow(b, 2.2);

    const lum = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
    totalLum += lum;

    const cmax = Math.max(r, g, b);
    const cmin = Math.min(r, g, b);
    const chroma = cmax > 1e-4 ? (cmax - cmin) / (cmax + 1e-6) : 0;

    const wlum = Math.sqrt(Math.max(0, lum));
    totalChromaW += chroma * wlum;
    totalLumW += wlum;

    const w = chroma * chroma * wlum;
    rSum += rl * w;
    gSum += gl * w;
    bSum += bl * w;
    weightSum += w;
  }

  const sceneLumLin = totalLum / len;
  const sceneLum = Math.sqrt(Math.max(0, sceneLumLin));
  const sceneChroma = totalChromaW / (totalLumW + 1e-9);

  if (sceneChroma < ACHROMATIC_THRESHOLD) {
    const v = Math.round(255 * Math.min(1, sceneLum * 1.05));
    return { r: v, g: v, b: v, lum: sceneLum, chroma: sceneChroma };
  }

  const wt = weightSum + 1e-9;
  const rL = rSum / wt;
  const gL = gSum / wt;
  const bL = bSum / wt;

  let rO = Math.pow(Math.max(0, Math.min(1, rL)), 1 / 2.2);
  let gO = Math.pow(Math.max(0, Math.min(1, gL)), 1 / 2.2);
  let bO = Math.pow(Math.max(0, Math.min(1, bL)), 1 / 2.2);

  const peak = Math.max(rO, gO, bO);
  if (peak > 1e-4) {
    rO /= peak;
    gO /= peak;
    bO /= peak;
  }

  return {
    r: Math.round(rO * 255),
    g: Math.round(gO * 255),
    b: Math.round(bO * 255),
    lum: sceneLum,
    chroma: sceneChroma,
  };
}

export function lumToBrightness(lum: number): number {
  if (lum < 0.04) return 0;
  return Math.max(1, Math.min(255, Math.round(25 + Math.pow(lum, 0.7) * 230)));
}
