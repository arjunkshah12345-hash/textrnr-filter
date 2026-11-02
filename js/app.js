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
let processing = false;

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

Object.values(sliders).forEach((el) => {
  el.addEventListener("input", syncLabels);
});
syncLabels();

function showPreview(img) {
  beforeEl.replaceChildren();
  const c = document.createElement("canvas");
  const max = 720;
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  beforeEl.appendChild(c);
  afterEl.replaceChildren();
  afterEl.innerHTML = `<p class="placeholder">Hit apply to run the filter.</p>`;
  stage.hidden = false;
  processBtn.disabled = false;
  downloadBtn.disabled = true;
  resultCanvas = null;
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Drop an image file (jpg, png, webp).");
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    sourceImage = img;
    showPreview(img);
    setStatus(`${file.name} · ${img.naturalWidth}×${img.naturalHeight}`);
  };
  img.onerror = () => setStatus("Couldn’t read that image.");
  img.src = url;
}

drop.addEventListener("click", () => fileInput.click());
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
    afterEl.replaceChildren();
    const view = document.createElement("canvas");
    const max = 720;
    const scale = Math.min(
      1,
      max / Math.max(resultCanvas.width, resultCanvas.height)
    );
    view.width = Math.round(resultCanvas.width * scale);
    view.height = Math.round(resultCanvas.height * scale);
    view.getContext("2d").drawImage(resultCanvas, 0, 0, view.width, view.height);
    afterEl.appendChild(view);
    downloadBtn.disabled = false;
    const ms = Math.round(performance.now() - t0);
    setStatus(
      `Done in ${ms}ms · output ${resultCanvas.width}×${resultCanvas.height}`
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

sampleBtn.addEventListener("click", async () => {
  setStatus("Loading sample…");
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    sourceImage = img;
    showPreview(img);
    setStatus("Sample loaded — hit apply.");
  };
  img.onerror = () => setStatus("Sample missing locally.");
  img.src = "./examples/sample.jpg";
});
