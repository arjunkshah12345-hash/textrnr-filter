import { applyTextrnrFilter, DEFAULTS } from "./filter.js";

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const processBtn = document.getElementById("process");
const downloadBtn = document.getElementById("download");
const statusEl = document.getElementById("status");
const beforeEl = document.getElementById("before");
const afterEl = document.getElementById("after");
const stage = document.getElementById("stage");
const sampleBtn = document.getElementById("sample");
const presetsEl = document.getElementById("presets");
const compare = document.getElementById("compare");
const compareStack = document.getElementById("compare-stack");
const compareRange = document.getElementById("compare-range");
const beforeWrap = document.getElementById("before-wrap");
const compareBefore = document.getElementById("compare-before");
const compareAfter = document.getElementById("compare-after");

const PRESETS = {
  classic: { strength: 1, blur: 9, grain: 12, warmth: 0.12, vignette: 0.34 },
  soft: { strength: 0.8, blur: 12, grain: 8, warmth: 0.1, vignette: 0.28 },
  heavy: { strength: 1.15, blur: 8, grain: 18, warmth: 0.14, vignette: 0.4 },
  cold: { strength: 1, blur: 9, grain: 11, warmth: 0.05, vignette: 0.36 },
};

const sliders = {
  strength: document.getElementById("strength"),
  blur: document.getElementById("blur"),
  grain: document.getElementById("grain"),
  warmth: document.getElementById("warmth"),
  vignette: document.getElementById("vignette"),
};

const values = {
  strength: document.getElementById("strength-val"),
  blur: document.getElementById("blur-val"),
  grain: document.getElementById("grain-val"),
  warmth: document.getElementById("warmth-val"),
  vignette: document.getElementById("vignette-val"),
};

let sourceImage = null;
let resultCanvas = null;
let beforePreviewCanvas = null;
let processing = false;
let activePreset = "classic";

function setStatus(msg) {
  statusEl.textContent = msg;
}

function syncLabels() {
  values.strength.textContent = Number(sliders.strength.value).toFixed(2);
  values.blur.textContent = sliders.blur.value;
  values.grain.textContent = sliders.grain.value;
  values.warmth.textContent = Number(sliders.warmth.value).toFixed(2);
  values.vignette.textContent = Number(sliders.vignette.value).toFixed(2);
}

function markPreset(name) {
  activePreset = name;
  presetsEl.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("is-on", chip.dataset.preset === name);
  });
}

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  sliders.strength.value = p.strength;
  sliders.blur.value = p.blur;
  sliders.grain.value = p.grain;
  sliders.warmth.value = p.warmth;
  sliders.vignette.value = p.vignette;
  syncLabels();
  markPreset(name);
}

Object.values(sliders).forEach((el) => {
  el.addEventListener("input", () => {
    syncLabels();
    markPreset(null);
  });
});
syncLabels();

presetsEl.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-preset]");
  if (!chip) return;
  applyPreset(chip.dataset.preset);
  if (sourceImage && !processing) process();
});

function makePreviewCanvas(src, max = 720) {
  const c = document.createElement("canvas");
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  const scale = Math.min(1, max / Math.max(sw, sh));
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function fitCompareCanvases(srcCanvas, destCanvas) {
  const rect = compareStack.getBoundingClientRect();
  const cw = Math.max(1, Math.floor(rect.width));
  const ch = Math.max(1, Math.floor(rect.height));
  destCanvas.width = cw;
  destCanvas.height = ch;
  const ctx = destCanvas.getContext("2d");
  ctx.fillStyle = "#111110";
  ctx.fillRect(0, 0, cw, ch);
  const scale = Math.max(cw / srcCanvas.width, ch / srcCanvas.height);
  const dw = srcCanvas.width * scale;
  const dh = srcCanvas.height * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  ctx.drawImage(srcCanvas, dx, dy, dw, dh);
}

function updateCompare(pct) {
  beforeWrap.style.width = `${pct}%`;
  const w = compareStack.clientWidth;
  compareBefore.style.width = `${w}px`;
  compareBefore.style.height = "100%";
}

function showCompare() {
  if (!beforePreviewCanvas || !resultCanvas) return;
  fitCompareCanvases(resultCanvas, compareAfter);
  fitCompareCanvases(beforePreviewCanvas, compareBefore);
  compare.hidden = false;
  stage.classList.add("has-result");
  updateCompare(Number(compareRange.value));
}

compareRange.addEventListener("input", () => {
  updateCompare(Number(compareRange.value));
});

window.addEventListener("resize", () => {
  if (!compare.hidden && resultCanvas) showCompare();
});

function showPreview(img) {
  beforeEl.replaceChildren();
  beforePreviewCanvas = makePreviewCanvas(img);
  beforeEl.appendChild(beforePreviewCanvas);
  afterEl.replaceChildren();
  afterEl.innerHTML = `<p class="placeholder">Running filter…</p>`;
  compare.hidden = true;
  stage.classList.remove("has-result");
  stage.hidden = false;
  processBtn.disabled = false;
  downloadBtn.disabled = true;
  resultCanvas = null;
  stage.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadFile(file, { auto = true } = {}) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Drop an image file (jpg, png, webp).");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    URL.revokeObjectURL(url);
    sourceImage = img;
    showPreview(img);
    setStatus(`${file.name} · ${img.naturalWidth}×${img.naturalHeight}`);
    if (auto) await process();
  };
  img.onerror = () => setStatus("Couldn’t read that image.");
  img.src = url;
}

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  if (fileInput.files?.[0]) loadFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((evt) => {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.add("is-hot");
  });
});
["dragleave", "drop"].forEach((evt) => {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.remove("is-hot");
  });
});
drop.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (file) loadFile(file);
});

window.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        e.preventDefault();
        loadFile(file);
      }
      break;
    }
  }
});

async function process() {
  if (!sourceImage || processing) return;
  processing = true;
  processBtn.disabled = true;
  setStatus("Applying filter…");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const t0 = performance.now();
    resultCanvas = applyTextrnrFilter(sourceImage, {
      strength: Number(sliders.strength.value),
      blur: Number(sliders.blur.value),
      grain: Number(sliders.grain.value),
      warmth: Number(sliders.warmth.value),
      vignetteStrength: Number(sliders.vignette.value),
      bloomStrength: DEFAULTS.bloomStrength,
      seed: 7,
      maxEdge: 1600,
    });

    const preview = makePreviewCanvas(resultCanvas);
    afterEl.replaceChildren();
    afterEl.appendChild(preview);

    showCompare();
    downloadBtn.disabled = false;
    const ms = Math.round(performance.now() - t0);
    const presetNote = activePreset ? ` · ${activePreset}` : "";
    setStatus(
      `Done in ${ms}ms · ${resultCanvas.width}×${resultCanvas.height}${presetNote}`
    );
  } catch (err) {
    console.error(err);
    setStatus("Filter failed — try a smaller image.");
  } finally {
    processing = false;
    processBtn.disabled = false;
  }
}

processBtn.addEventListener("click", process);

downloadBtn.addEventListener("click", () => {
  if (!resultCanvas) return;
  const a = document.createElement("a");
  a.download = "textrnr-filter.png";
  a.href = resultCanvas.toDataURL("image/png");
  a.click();
});

async function loadSample() {
  setStatus("Loading sample…");
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = "./examples/sample.jpg";
  });
  sourceImage = img;
  showPreview(img);
  setStatus("Sample — applying…");
  await process();
}

sampleBtn.addEventListener("click", () => {
  loadSample().catch(() => setStatus("Sample missing locally."));
});
