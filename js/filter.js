/**
 * textrnr-style lo-fi night filter (browser)
 * Soft focus + bloom + warm/cool grade + vignette + fine grain + light CA
 */

function clamp(v, lo = 0, hi = 255) {
  return v < lo ? lo : v > hi ? hi : v;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function getRGB(ctx, w, h) {
  return ctx.getImageData(0, 0, w, h);
}

function drawImageCover(ctx, img, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
}

function softBlur(sourceCanvas, radius) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = makeCanvas(w, h);
  const ctx = out.getContext("2d");
  const r1 = Math.max(0.5, radius * 0.55);
  const r2 = Math.max(0.5, radius * 0.75);
  ctx.filter = `blur(${r1}px)`;
  ctx.drawImage(sourceCanvas, 0, 0);
  const mid = makeCanvas(w, h);
  mid.getContext("2d").drawImage(out, 0, 0);
  ctx.filter = `blur(${r2}px)`;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(mid, 0, 0);
  ctx.filter = "none";
  return out;
}

/** Mix sharp + soft so the frame keeps structure */
function softFocusMix(sourceCanvas, radius, mix = 0.48) {
  const soft = softBlur(sourceCanvas, radius);
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const out = makeCanvas(w, h);
  const ctx = out.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.globalAlpha = Math.max(0, Math.min(1, mix));
  ctx.drawImage(soft, 0, 0);
  ctx.globalAlpha = 1;
  return out;
}

function bloom(sourceCanvas, strength = 0.38, threshold = 168) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d");
  const src = getRGB(srcCtx, w, h);
  const d = src.data;

  const bright = makeCanvas(w, h);
  const bctx = bright.getContext("2d");
  const bid = bctx.createImageData(w, h);
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const m = Math.max(0, Math.min(1, (lum - threshold) / (255 - threshold)));
    const soft = m * m;
    bid.data[i] = d[i] * soft;
    bid.data[i + 1] = d[i + 1] * soft;
    bid.data[i + 2] = d[i + 2] * soft;
    bid.data[i + 3] = 255;
  }
  bctx.putImageData(bid, 0, 0);

  const blurred = softBlur(bright, 14);
  const blurred2 = softBlur(blurred, 10);
  const bloomData = getRGB(blurred2.getContext("2d"), w, h).data;

  const out = makeCanvas(w, h);
  const octx = out.getContext("2d");
  const oid = octx.createImageData(w, h);
  for (let i = 0; i < d.length; i += 4) {
    oid.data[i] = clamp(d[i] + bloomData[i] * strength);
    oid.data[i + 1] = clamp(d[i + 1] + bloomData[i + 1] * strength * 0.92);
    oid.data[i + 2] = clamp(d[i + 2] + bloomData[i + 2] * strength * 0.78);
    oid.data[i + 3] = 255;
  }
  octx.putImageData(oid, 0, 0);
  return out;
}

function warmCoolGrade(sourceCanvas, warmth = 0.12) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;
  const warm = [1.0, 0.78, 0.55];
  const cool = [0.42, 0.58, 0.78];

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadows = Math.max(0, Math.min(1, 1 - lum * 1.25));
    const highlights = Math.max(0, Math.min(1, (lum - 0.42) / 0.58));

    const wh = warmth * highlights * 0.72;
    r = r * (1 - wh) + warm[0] * wh * Math.max(r, 0.2);
    g = g * (1 - wh) + warm[1] * wh * Math.max(g, 0.2);
    b = b * (1 - wh) + warm[2] * wh * Math.max(b, 0.2);

    const ws = warmth * 0.55 * shadows;
    r = r * (1 - ws) + cool[0] * ws * Math.max(r, 0.1);
    g = g * (1 - ws) + cool[1] * ws * Math.max(g, 0.1);
    b = b * (1 - ws) + cool[2] * ws * Math.max(b, 0.1);

    r = Math.max(0, Math.min(1, (r - 0.02) / 0.98));
    g = Math.max(0, Math.min(1, (g - 0.02) / 0.98));
    b = Math.max(0, Math.min(1, (b - 0.02) / 0.98));

    d[i] = clamp(r * 255);
    d[i + 1] = clamp(g * 255);
    d[i + 2] = clamp(b * 255);
  }
  ctx.putImageData(img, 0, 0);
  return sourceCanvas;
}

function adjustColor(sourceCanvas, contrast, saturation, brightness) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    r = ((r - 0.5) * contrast + 0.5) * brightness;
    g = ((g - 0.5) * contrast + 0.5) * brightness;
    b = ((b - 0.5) * contrast + 0.5) * brightness;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * saturation;
    g = lum + (g - lum) * saturation;
    b = lum + (b - lum) * saturation;

    d[i] = clamp(r * 255);
    d[i + 1] = clamp(g * 255);
    d[i + 2] = clamp(b * 255);
  }
  ctx.putImageData(img, 0, 0);
  return sourceCanvas;
}

function slightCA(sourceCanvas, shift = 1) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const src = getRGB(ctx, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const o = out.data;
  const sh = Math.max(0, shift | 0);
  if (sh === 0) return sourceCanvas;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const xr = Math.min(w - 1, x + sh);
      const xb = Math.max(0, x - sh);
      const ir = (y * w + xr) * 4;
      const ib = (y * w + xb) * 4;
      // blend CA lightly with original green channel center
      o[i] = Math.round(s[i] * 0.35 + s[ir] * 0.65);
      o[i + 1] = s[i + 1];
      o[i + 2] = Math.round(s[i + 2] * 0.35 + s[ib + 2] * 0.65);
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return sourceCanvas;
}

function vignette(sourceCanvas, strength = 0.36) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = w * 0.82;
  const ry = h * 0.82;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      const mask = Math.max(
        0.42,
        Math.min(1, 1 - strength * Math.pow(Math.max(0, r - 0.28), 1.5))
      );
      d[i] *= mask;
      d[i + 1] *= mask;
      d[i + 2] *= mask;
    }
  }
  ctx.putImageData(img, 0, 0);
  return sourceCanvas;
}

/** Fine film grain — luma-led, low chroma, resolution-aware */
function coloredGrain(sourceCanvas, amount = 12, chroma = 0.22, seed = 7) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;
  const rnd = mulberry32(seed);
  const scale = Math.max(0.55, Math.min(1.15, 900 / Math.max(w, h)));
  const amp = amount * scale;

  function gauss() {
    const u = 1 - rnd();
    const v = 1 - rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const mid = 0.4 + 0.6 * (1 - Math.abs(lum - 128) / 128);
    const mono = gauss() * amp;
    d[i] = clamp(d[i] + (mono + gauss() * amp * chroma) * mid);
    d[i + 1] = clamp(d[i + 1] + (mono + gauss() * amp * chroma) * mid);
    d[i + 2] = clamp(d[i + 2] + (mono + gauss() * amp * chroma) * mid);
  }
  ctx.putImageData(img, 0, 0);
  return sourceCanvas;
}

/**
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} image
 * @param {object} opts
 * @returns {HTMLCanvasElement}
 */
export function applyTextrnrFilter(image, opts = {}) {
  const {
    strength = 1.0,
    blur = 9,
    grain = 12,
    bloomStrength = 0.36,
    warmth = 0.12,
    vignetteStrength = 0.34,
    seed = 7,
    maxEdge = 1600,
  } = opts;

  const s = Math.max(0.1, strength);
  let w = image.naturalWidth || image.width;
  let h = image.naturalHeight || image.height;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  let work = makeCanvas(w, h);
  drawImageCover(work.getContext("2d"), image, w, h);

  // 1 soft focus (retain structure)
  work = softFocusMix(work, blur * s, 0.42 + 0.12 * Math.min(s, 1.2));

  // 2 bloom
  work = bloom(work, bloomStrength * s);

  // 3 micro soft
  {
    const soft = makeCanvas(w, h);
    const ctx = soft.getContext("2d");
    ctx.filter = `blur(${Math.max(0.4, 0.9 * s)}px)`;
    ctx.drawImage(work, 0, 0);
    ctx.filter = "none";
    ctx.globalAlpha = 0.35;
    const mix = makeCanvas(w, h);
    const mctx = mix.getContext("2d");
    mctx.drawImage(work, 0, 0);
    mctx.globalAlpha = 0.35;
    mctx.drawImage(soft, 0, 0);
    mctx.globalAlpha = 1;
    work = mix;
  }

  // 4 grade
  work = warmCoolGrade(work, warmth * s);

  // 5 gentle contrast / sat
  work = adjustColor(work, 1.04 + 0.04 * s, 1.04 + 0.05 * s, 0.985);

  // 6 light CA
  work = slightCA(work, s > 0.85 ? 1 : 0);

  // 7 vignette
  work = vignette(work, vignetteStrength * Math.min(s, 1.2));

  // 8 fine grain
  work = coloredGrain(work, grain * s, 0.2, seed);

  return work;
}

export const DEFAULTS = {
  strength: 1,
  blur: 9,
  grain: 12,
  bloomStrength: 0.36,
  warmth: 0.12,
  vignetteStrength: 0.34,
};
