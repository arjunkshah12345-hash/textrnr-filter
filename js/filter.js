/**
 * textrnr-style lo-fi night filter (browser)
 * Soft focus + bloom + warm/cool grade + vignette + colored grain + CA
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

function bloom(sourceCanvas, strength = 0.55, threshold = 150) {
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
    bid.data[i] = d[i] * m;
    bid.data[i + 1] = d[i + 1] * m;
    bid.data[i + 2] = d[i + 2] * m;
    bid.data[i + 3] = 255;
  }
  bctx.putImageData(bid, 0, 0);

  const blurred = softBlur(bright, 18);
  const blurred2 = softBlur(blurred, 12);
  const bloomData = getRGB(blurred2.getContext("2d"), w, h).data;

  const out = makeCanvas(w, h);
  const octx = out.getContext("2d");
  const oid = octx.createImageData(w, h);
  for (let i = 0; i < d.length; i += 4) {
    oid.data[i] = clamp(d[i] + bloomData[i] * strength);
    oid.data[i + 1] = clamp(d[i + 1] + bloomData[i + 1] * strength);
    oid.data[i + 2] = clamp(d[i + 2] + bloomData[i + 2] * strength);
    oid.data[i + 3] = 255;
  }
  octx.putImageData(oid, 0, 0);
  return out;
}

function warmCoolGrade(sourceCanvas, warmth = 0.18) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;
  const warm = [1.0, 0.72, 0.42];
  const cool = [0.35, 0.55, 0.85];

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const shadows = Math.max(0, Math.min(1, 1 - lum * 1.35));
    const highlights = Math.max(0, Math.min(1, (lum - 0.35) / 0.65));

    const hr = Math.max(r, 0.15);
    const hg = Math.max(g, 0.15);
    const hb = Math.max(b, 0.15);
    r = r * (1 - warmth * highlights) + warm[0] * warmth * highlights * hr;
    g = g * (1 - warmth * highlights) + warm[1] * warmth * highlights * hg;
    b = b * (1 - warmth * highlights) + warm[2] * warmth * highlights * hb;

    const sr = Math.max(r, 0.08);
    const sg = Math.max(g, 0.08);
    const sb = Math.max(b, 0.08);
    const ws = warmth * 0.85;
    r = r * (1 - ws * shadows) + cool[0] * ws * shadows * sr;
    g = g * (1 - ws * shadows) + cool[1] * ws * shadows * sg;
    b = b * (1 - ws * shadows) + cool[2] * ws * shadows * sb;

    r = Math.max(0, Math.min(1, (r - 0.04) / 0.96));
    g = Math.max(0, Math.min(1, (g - 0.04) / 0.96));
    b = Math.max(0, Math.min(1, (b - 0.04) / 0.96));

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
  const c = contrast;
  const s = saturation;
  const br = brightness;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    r = ((r - 0.5) * c + 0.5) * br;
    g = ((g - 0.5) * c + 0.5) * br;
    b = ((b - 0.5) * c + 0.5) * br;

    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * s;
    g = lum + (g - lum) * s;
    b = lum + (b - lum) * s;

    d[i] = clamp(r * 255);
    d[i + 1] = clamp(g * 255);
    d[i + 2] = clamp(b * 255);
  }
  ctx.putImageData(img, 0, 0);
  return sourceCanvas;
}

function slightCA(sourceCanvas, shift = 2) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const src = getRGB(ctx, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const o = out.data;
  const sh = Math.max(1, shift | 0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const xr = Math.min(w - 1, x + sh);
      const xb = Math.max(0, x - sh);
      const ir = (y * w + xr) * 4;
      const ib = (y * w + xb) * 4;
      o[i] = s[ir];
      o[i + 1] = s[i + 1];
      o[i + 2] = s[ib + 2];
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return sourceCanvas;
}

function vignette(sourceCanvas, strength = 0.55) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = w * 0.72;
  const ry = h * 0.72;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      const mask = Math.max(
        0.15,
        Math.min(1, 1 - strength * Math.pow(Math.max(0, r - 0.15), 1.35))
      );
      d[i] *= mask;
      d[i + 1] *= mask;
      d[i + 2] *= mask;
    }
  }
  ctx.putImageData(img, 0, 0);
  return sourceCanvas;
}

function coloredGrain(sourceCanvas, amount = 24, chroma = 0.55, seed = 7) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const ctx = sourceCanvas.getContext("2d");
  const img = getRGB(ctx, w, h);
  const d = img.data;
  const rnd = mulberry32(seed);

  // Box-Muller
  function gauss() {
    const u = 1 - rnd();
    const v = 1 - rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const mid = 0.55 + 0.7 * (1 - Math.abs(lum - 128) / 128);
    const mono = gauss() * amount;
    d[i] = clamp(d[i] + (mono + gauss() * amount * chroma) * mid);
    d[i + 1] = clamp(d[i + 1] + (mono + gauss() * amount * chroma) * mid);
    d[i + 2] = clamp(d[i + 2] + (mono + gauss() * amount * chroma) * mid);
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
    blur = 14,
    grain = 24,
    bloomStrength = 0.62,
    warmth = 0.2,
    vignetteStrength = 0.58,
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

  // 1 soft focus
  work = softBlur(work, blur * s);

  // 2 bloom
  work = bloom(work, bloomStrength * s);

  // 3 soft pass
  {
    const soft = makeCanvas(w, h);
    const ctx = soft.getContext("2d");
    ctx.filter = `blur(${Math.max(0.5, 2.2 * s)}px)`;
    ctx.drawImage(work, 0, 0);
    ctx.filter = "none";
    work = soft;
  }

  // 4 grade
  work = warmCoolGrade(work, warmth * s);

  // 5 contrast / sat / brightness
  work = adjustColor(
    work,
    1.08 + 0.08 * s,
    1.12 + 0.1 * s,
    0.96
  );

  // 6 CA
  work = slightCA(work, Math.max(1, Math.round(2 * s)));

  // 7 vignette
  work = vignette(work, vignetteStrength * Math.min(s, 1.4));

  // 8 grain
  work = coloredGrain(work, grain * s, 0.55, seed);

  return work;
}

export const DEFAULTS = {
  strength: 1,
  blur: 14,
  grain: 24,
  bloomStrength: 0.62,
  warmth: 0.2,
  vignetteStrength: 0.58,
};
