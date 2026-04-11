/**
 * Aura color extraction — chroma²-weighted blend in linear light, with
 * achromatic detection. Direct port of the Python algorithm in
 * wiz_ambient/video.py. Designed to run on a downsized canvas (~64x64)
 * every ~100ms — well under 1ms per call in JS.
 */

export type ExtractResult = {
  r: number;
  g: number;
  b: number;
  lum: number; // 0..1, perceptual scene luminance
  chroma: number; // 0..1, scene chroma
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

    // Linearize sRGB → linear light (gamma 2.2)
    const rl = Math.pow(r, 2.2);
    const gl = Math.pow(g, 2.2);
    const bl = Math.pow(b, 2.2);

    // Per-pixel perceptual luminance (Rec 709 in linear space)
    const lum = rl * 0.2126 + gl * 0.7152 + bl * 0.0722;
    totalLum += lum;

    // HSV-style chroma in display sRGB
    const cmax = Math.max(r, g, b);
    const cmin = Math.min(r, g, b);
    const chroma = cmax > 1e-4 ? (cmax - cmin) / (cmax + 1e-6) : 0;

    // Scene chroma weighted by sqrt(luminance)
    const wlum = Math.sqrt(Math.max(0, lum));
    totalChromaW += chroma * wlum;
    totalLumW += wlum;

    // Pixel weight = chroma² · √lum — squaring chroma kills skin tones
    const w = chroma * chroma * wlum;
    rSum += rl * w;
    gSum += gl * w;
    bSum += bl * w;
    weightSum += w;
  }

  const sceneLumLin = totalLum / len;
  const sceneLum = Math.sqrt(Math.max(0, sceneLumLin));
  const sceneChroma = totalChromaW / (totalLumW + 1e-9);

  // Achromatic scene → white scaled by luminance
  if (sceneChroma < ACHROMATIC_THRESHOLD) {
    const v = Math.round(255 * Math.min(1, sceneLum * 1.05));
    return { r: v, g: v, b: v, lum: sceneLum, chroma: sceneChroma };
  }

  // Weighted blend in linear space
  const wt = weightSum + 1e-9;
  let rL = rSum / wt;
  let gL = gSum / wt;
  let bL = bSum / wt;

  // Re-encode linear → sRGB
  let rO = Math.pow(Math.max(0, Math.min(1, rL)), 1 / 2.2);
  let gO = Math.pow(Math.max(0, Math.min(1, gL)), 1 / 2.2);
  let bO = Math.pow(Math.max(0, Math.min(1, bL)), 1 / 2.2);

  // Renormalize so the brightest channel hits 1.0 — saturated hue
  // representation; brightness handled separately by luminance path
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

/**
 * Map perceptual luminance (0..1) → bulb brightness (0..255), with the
 * 10% hardware floor and a hard cutoff for near-black.
 */
export function lumToBrightness(lum: number): number {
  if (lum < 0.04) return 0; // bulb off
  return Math.max(1, Math.min(255, Math.round(25 + Math.pow(lum, 0.7) * 230)));
}
