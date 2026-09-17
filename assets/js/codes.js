// Barcode rendering (bwip-js) and reading (native BarcodeDetector, ZXing fallback).
// Both libraries are vendored under assets/vendor and loaded as classic scripts,
// so everything works offline once the service worker has cached them.

export const FORMATS = [
  { id: "ean13", label: "EAN-13", bcid: "ean13" },
  { id: "ean8", label: "EAN-8", bcid: "ean8" },
  { id: "upca", label: "UPC-A", bcid: "upca" },
  { id: "upce", label: "UPC-E", bcid: "upce" },
  { id: "code128", label: "Code 128", bcid: "code128" },
  { id: "code39", label: "Code 39", bcid: "code39" },
  { id: "code93", label: "Code 93", bcid: "code93" },
  { id: "itf", label: "ITF", bcid: "interleaved2of5" },
  { id: "codabar", label: "Codabar", bcid: "rationalizedCodabar" },
  { id: "databar", label: "GS1 DataBar", bcid: "databaromni" },
  { id: "qrcode", label: "QR Code", bcid: "qrcode", square: true },
  { id: "datamatrix", label: "Data Matrix", bcid: "datamatrix", square: true },
  { id: "aztec", label: "Aztec", bcid: "azteccode", square: true },
  { id: "pdf417", label: "PDF417", bcid: "pdf417" },
];

export const formatById = (id) => FORMATS.find((f) => f.id === id) || FORMATS[4];

// Maps names coming from BarcodeDetector ("ean_13") and ZXing ("EAN_13") to our ids.
const ALIASES = {
  ean13: "ean13", ean8: "ean8", upca: "upca", upce: "upce",
  code128: "code128", code39: "code39", code93: "code93",
  itf: "itf", codabar: "codabar", rss14: "databar", rssexpanded: "databar",
  qrcode: "qrcode", datamatrix: "datamatrix", aztec: "aztec", pdf417: "pdf417",
};
export function normalizeFormat(name) {
  return ALIASES[String(name).toLowerCase().replace(/[^a-z0-9]/g, "")] || "code128";
}

function gtinValid(digits) {
  const d = digits.split("").map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// Best guess for a number typed by hand.
export function guessFormat(value) {
  const v = value.trim();
  if (/^\d+$/.test(v) && gtinValid(v)) {
    if (v.length === 13) return "ean13";
    if (v.length === 8) return "ean8";
    if (v.length === 12) return "upca";
  }
  return "code128";
}

function toSVG(bcid, text, square) {
  const opts = { bcid, text, scale: 3, paddingwidth: 0, paddingheight: 0 };
  if (!square && bcid !== "pdf417") opts.height = 18;
  if (bcid === "rationalizedCodabar" && !/^[A-D].*[A-D]$/i.test(text)) opts.text = "A" + text + "A";
  return window.bwipjs.toSVG(opts);
}

// Returns { svg, fallback }: when the stored format can't encode the value
// (e.g. wrong EAN check digit) it degrades to Code 128 instead of failing.
export function renderCode(value, formatId) {
  const f = formatById(formatId);
  try {
    return { svg: toSVG(f.bcid, value, f.square), square: !!f.square, fallback: false };
  } catch (err) {
    try {
      return { svg: toSVG("code128", value, false), square: false, fallback: true };
    } catch (_) {
      return { svg: "", square: false, fallback: true };
    }
  }
}

/* ---------- Reading ---------- */

let nativeDetector;
async function getNativeDetector() {
  if (nativeDetector !== undefined) return nativeDetector;
  nativeDetector = null;
  if ("BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.length) nativeDetector = new window.BarcodeDetector({ formats });
    } catch (_) { /* fall back to ZXing */ }
  }
  return nativeDetector;
}

let zxingReader;
function zxingDecode(canvas) {
  const Z = window.ZXing;
  if (!zxingReader) {
    zxingReader = new Z.MultiFormatReader();
    const hints = new Map();
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    zxingReader.setHints(hints);
  }
  const source = new Z.HTMLCanvasElementLuminanceSource(canvas);
  // Hybrid handles uneven light; global histogram rescues some noisy photos.
  for (const Binarizer of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
    try {
      const r = zxingReader.decode(new Z.BinaryBitmap(new Binarizer(source)));
      return { value: r.getText(), format: normalizeFormat(Z.BarcodeFormat[r.getBarcodeFormat()]) };
    } catch (_) { /* try the next binarizer */ }
  }
  return null;
}

async function detect(source, canvas) {
  const native = await getNativeDetector();
  if (native) {
    try {
      const found = await native.detect(source);
      if (found.length) return { value: found[0].rawValue, format: normalizeFormat(found[0].format) };
      return null;
    } catch (_) { /* some sources unsupported: try ZXing */ }
  }
  return zxingDecode(canvas);
}

function drawTo(canvas, source, w, h, maxSide) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Real photos are often large, tilted or with a small code: try a few views
// of the same image, cheapest first, and stop at the first hit.
export async function scanImage(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const tmp = () => document.createElement("canvas");
  const canvas = tmp();
  const views = [
    () => drawTo(canvas, img, w, h, 1600),
    () => drawTo(canvas, img, w, h, 3000),
    () => crop(canvas, img, w, h, 0.6),
    () => crop(canvas, img, w, h, 0.35),
    () => rotate(canvas, drawTo(tmp(), img, w, h, 1600)),
    () => rotate(canvas, crop(tmp(), img, w, h, 0.6)),
    () => rotate(canvas, crop(tmp(), img, w, h, 0.35)),
  ];
  for (const view of views) {
    const c = view();
    const r = await detect(c, c);
    if (r) return r;
  }
  return null;
}

// Center crop, upscaled so a small code gets more pixels.
function crop(canvas, img, w, h, fraction) {
  const cw = w * fraction, ch = h * fraction;
  const k = Math.min(1600 / Math.max(cw, ch), 3);
  canvas.width = Math.round(cw * k);
  canvas.height = Math.round(ch * k);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function rotate(canvas, src) {
  canvas.width = src.height;
  canvas.height = src.width;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return canvas;
}

// Live camera scanner bound to a <video> element.
export class CameraScanner {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement("canvas");
    this.stream = null;
    this.running = false;
  }

  async start(onResult) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.running = true;
    const tick = async () => {
      if (!this.running) return;
      const v = this.video;
      if (v.readyState >= 2 && v.videoWidth) {
        drawTo(this.canvas, v, v.videoWidth, v.videoHeight, 1280);
        const r = await detect(this.canvas, this.canvas);
        if (r && this.running) { onResult(r); return; }
      }
      setTimeout(tick, 120);
    };
    tick();
  }

  get track() {
    return this.stream ? this.stream.getVideoTracks()[0] : null;
  }

  hasTorch() {
    const t = this.track;
    return !!(t && t.getCapabilities && t.getCapabilities().torch);
  }

  async setTorch(on) {
    const t = this.track;
    if (t) await t.applyConstraints({ advanced: [{ torch: on }] });
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}

/* ---------- Card photo helpers ---------- */

// Downscales a photo to a JPEG data URL small enough to keep in IndexedDB.
export function photoToDataURL(img, maxSide = 900) {
  const c = drawTo(document.createElement("canvas"), img, img.naturalWidth, img.naturalHeight, maxSide);
  return c.toDataURL("image/jpeg", 0.82);
}

// Dominant, reasonably saturated color of an image: coarse histogram, no AI.
export function dominantColor(img) {
  const c = drawTo(document.createElement("canvas"), img, img.naturalWidth, img.naturalHeight, 64);
  const { data } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (max < 40 || (sat < 0.25 && max > 215)) continue; // skip near-black and near-white
    const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, w: 0 };
    const w = 1 + sat * 2;
    e.n += w; e.r += r * w; e.g += g * w; e.b += b * w;
    buckets.set(key, e);
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best) return null;
  const hex = (v) => Math.round(v / best.n).toString(16).padStart(2, "0");
  return ("#" + hex(best.r) + hex(best.g) + hex(best.b)).toUpperCase();
}
