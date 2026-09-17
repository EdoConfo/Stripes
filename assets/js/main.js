import { PALETTE, brandById, searchBrands, exactBrand, colorForName, textOn } from "./brands.js";
import { FORMATS, formatById, guessFormat, renderCode, CameraScanner, scanImage, loadImage, photoToDataURL, dominantColor } from "./codes.js";
import { allCards, putCard, putCards, deleteCard, newId, requestPersistence, settings } from "./store.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let cards = [];
let query = "";
let sortMode = settings.get("sort", "recent");

/* ---------- Toast ---------- */

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- Overlays, wired to history so the back gesture closes them ---------- */

const stack = [];

function openOverlay(el, onClose) {
  el.hidden = false;
  stack.push({ el, onClose });
  document.body.classList.add("locked");
  history.pushState({ depth: stack.length }, "");
}

let popWaiters = [];
// Resolves once the top overlay has actually closed.
const closeTop = () => new Promise((resolve) => {
  if (!stack.length) return resolve();
  popWaiters.push(resolve);
  history.back();
});
const isTop = (el) => stack.length > 0 && stack[stack.length - 1].el === el;

window.addEventListener("popstate", (e) => {
  const depth = (e.state && e.state.depth) || 0;
  while (stack.length > depth) {
    const { el, onClose } = stack.pop();
    el.hidden = true;
    if (onClose) onClose();
  }
  if (!stack.length) document.body.classList.remove("locked");
  const waiters = popWaiters;
  popWaiters = [];
  waiters.forEach((fn) => fn());
});

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-close]")) closeTop();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) closeTop();
});

function confirmDialog({ title, text, ok = "Elimina", cancel = "Annulla", danger = true }) {
  return new Promise((resolve) => {
    let result = false;
    $("dialogTitle").textContent = title;
    $("dialogText").textContent = text;
    const okBtn = $("dialogOk");
    okBtn.textContent = ok;
    okBtn.className = "btn " + (danger ? "danger" : "primary");
    okBtn.hidden = !ok;
    $("dialogCancel").textContent = cancel;
    $("dialog").querySelector(".dialog").classList.toggle("info", !ok);
    okBtn.onclick = () => { result = true; closeTop(); };
    openOverlay($("dialog"), () => resolve(result));
  });
}

/* ---------- Card face ---------- */

function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

function maskedNumber(n) {
  const v = String(n || "").replace(/\s+/g, "");
  if (!v) return "";
  return v.length > 6 ? "•••• " + v.slice(-4) : v;
}

function faceHTML(card) {
  const f = formatById(card.format);
  return `
    <span class="mono" aria-hidden="true">${esc(initials(card.name || "?"))}</span>
    <div class="name">${esc(card.name || "Nuova carta")}</div>
    <div class="sub">
      <span class="${card.note ? "note-tag" : "digits"}">${esc(card.note || maskedNumber(card.number))}</span>
      ${card.number ? `<span class="fmt-badge${f.square ? " qr" : ""}" aria-hidden="true"></span>` : ""}
    </div>`;
}

function paintFace(el, card) {
  el.style.setProperty("--bg-c", card.color);
  el.style.setProperty("--fg-c", card.fg || textOn(card.color));
  el.classList.toggle("has-photo", !!card.photo);
  if (card.photo) el.style.setProperty("--photo", `url("${card.photo}")`);
  else el.style.removeProperty("--photo");
  el.innerHTML = faceHTML(card);
}

/* ---------- Home ---------- */

function sortedCards() {
  const list = [...cards];
  if (sortMode === "name") list.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  else list.sort((a, b) => (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt));
  return list;
}

function renderHome() {
  const grid = $("grid");
  const q = query.trim().toLowerCase();
  const list = sortedCards().filter((c) => !q || (c.name + " " + (c.note || "") + " " + c.number).toLowerCase().includes(q));

  grid.innerHTML = "";
  for (const card of list) {
    const btn = document.createElement("button");
    btn.className = "card-btn";
    btn.setAttribute("aria-label", card.name);
    const face = document.createElement("div");
    face.className = "card-face";
    paintFace(face, card);
    btn.append(face);
    btn.addEventListener("click", () => openDetail(card.id));
    grid.append(btn);
  }

  const empty = cards.length === 0;
  $("empty").hidden = !empty;
  $("fab").hidden = empty;
  $("btnSearch").hidden = cards.length < 4;
  $("noResults").hidden = empty || list.length > 0;
}

$("btnSearch").addEventListener("click", () => {
  const bar = $("searchBar");
  bar.hidden = !bar.hidden;
  if (bar.hidden) { query = ""; $("searchInput").value = ""; renderHome(); }
  else $("searchInput").focus();
});
$("searchInput").addEventListener("input", (e) => { query = e.target.value; renderHome(); });

/* ---------- Detail ---------- */

let detailId = null;
let wakeLock = null;

async function keepAwake() {
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch (_) { /* not critical */ }
}
function releaseAwake() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && detailId) keepAwake();
});

// Groups long digit strings for reading aloud; EAN/UPC keep their printed form.
function prettyNumber(n, format) {
  if (/^(ean|upc)/.test(format)) return n;
  return /^\d{9,}$/.test(n) ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : n;
}

function fillDetail(card) {
  $("detailTitle").textContent = card.name;
  paintFace($("detailFace"), card);
  const r = renderCode(card.number, card.format);
  const img = $("detailCodeImg");
  img.innerHTML = r.svg;
  img.classList.toggle("square", r.square);
  $("detailNum").textContent = prettyNumber(card.number, card.format);
  $("detailWarn").hidden = !r.fallback;
  $("detailNote").hidden = !card.note;
  $("detailNote").textContent = card.note || "";
}

function openDetail(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  detailId = id;
  fillDetail(card);
  $("detail").scrollTop = 0;
  openOverlay($("detail"), () => { detailId = null; releaseAwake(); renderHome(); });
  keepAwake();
  card.lastUsed = Date.now();
  card.uses = (card.uses || 0) + 1;
  putCard(card);
}

$("detailCode").addEventListener("click", () => {
  const card = cards.find((c) => c.id === detailId);
  if (!card) return;
  const r = renderCode(card.number, card.format);
  $("zoomImg").innerHTML = r.svg;
  $("zoomImg").classList.toggle("square", r.square);
  $("zoomNum").textContent = prettyNumber(card.number, card.format);
  $("zoom").classList.toggle("rotate", !r.square && innerHeight > innerWidth);
  openOverlay($("zoom"));
});
$("zoom").addEventListener("click", (e) => { if (!e.target.closest("[data-close]")) closeTop(); });

$("detailCopy").addEventListener("click", async () => {
  const card = cards.find((c) => c.id === detailId);
  try {
    await navigator.clipboard.writeText(card.number);
    toast("Numero copiato");
  } catch (_) {
    toast("Copia non disponibile");
  }
});

$("detailEdit").addEventListener("click", () => {
  const card = cards.find((c) => c.id === detailId);
  if (card) openEditor(card);
});

$("detailDelete").addEventListener("click", async () => {
  const card = cards.find((c) => c.id === detailId);
  if (!card) return;
  const ok = await confirmDialog({ title: "Eliminare la carta?", text: `"${card.name}" verrà rimossa da questo dispositivo.` });
  if (!ok) return;
  await deleteCard(card.id);
  cards = cards.filter((c) => c.id !== card.id);
  await closeTop();
  toast("Carta eliminata");
});

/* ---------- Editor ---------- */

let draft = null;
let editingId = null;
let colorTouched = false;

FORMATS.forEach((f) => $("fFormat").append(new Option(f.label, f.id)));
$("fFormat").prepend(new Option("Automatico", ""));

function draftCard() {
  const brand = brandById(draft.brandId);
  const fg = brand && draft.color.toUpperCase() === brand.bg.toUpperCase() ? brand.fg : textOn(draft.color);
  const format = draft.format || (draft.number ? guessFormat(draft.number) : "code128");
  return { ...draft, fg, format };
}

function refreshEditor() {
  const card = draftCard();
  paintFace($("editorFace"), card);
  renderChips();
  renderSwatches();

  const prev = $("codePreview");
  if (card.number) {
    const r = renderCode(card.number, card.format);
    prev.hidden = false;
    prev.classList.toggle("square", r.square);
    prev.innerHTML = r.svg + (r.fallback ? `<div class="bad">Il numero non è valido come ${esc(formatById(card.format).label)}: verrà usato Code 128.</div>` : "");
  } else {
    prev.hidden = true;
    prev.innerHTML = "";
  }
  $("btnPhotoRemove").hidden = !draft.photo;
  $("photoLabel").textContent = draft.photo ? "Cambia foto" : "Foto della carta";
}

function renderChips() {
  const box = $("brandChips");
  const typed = draft.name.trim();
  let list = searchBrands(typed);
  if (typed && list.length === 1 && list[0].id === draft.brandId) list = [];
  box.innerHTML = "";
  box.hidden = list.length === 0;
  for (const b of list.slice(0, 24)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (b.id === draft.brandId ? " selected" : "");
    chip.style.setProperty("--c", b.bg);
    chip.style.setProperty("--f", b.fg);
    chip.innerHTML = `<i>${esc(initials(b.name).slice(0, 1))}</i>${esc(b.name)}`;
    chip.addEventListener("click", () => {
      draft.name = b.name;
      draft.brandId = b.id;
      if (!colorTouched) draft.color = b.bg;
      $("fName").value = b.name;
      refreshEditor();
      if (!draft.number) $("fNumber").focus({ preventScroll: true });
    });
    box.append(chip);
  }
}

function renderSwatches() {
  const box = $("swatches");
  const brand = brandById(draft.brandId);
  const colors = [...new Set([brand && brand.bg, ...PALETTE].filter(Boolean).map((c) => c.toUpperCase()))];
  if (!colors.includes(draft.color.toUpperCase())) colors.unshift(draft.color.toUpperCase());
  box.innerHTML = "";
  for (const c of colors) {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "swatch" + (c === draft.color.toUpperCase() ? " selected" : "");
    sw.style.setProperty("--c", c);
    sw.setAttribute("aria-label", "Colore " + c);
    sw.addEventListener("click", () => { draft.color = c; colorTouched = true; refreshEditor(); });
    box.append(sw);
  }
  const picker = document.createElement("label");
  picker.className = "swatch picker";
  picker.setAttribute("aria-label", "Scegli colore");
  const input = document.createElement("input");
  input.type = "color";
  input.value = draft.color.length === 7 ? draft.color.toLowerCase() : "#888888";
  input.addEventListener("change", () => { draft.color = input.value.toUpperCase(); colorTouched = true; refreshEditor(); });
  picker.append(input);
  box.append(picker);
}

function openEditor(card) {
  editingId = card ? card.id : null;
  colorTouched = !!card;
  draft = card
    ? { name: card.name, brandId: card.brandId || null, number: card.number, format: card.format, color: card.color, photo: card.photo || null, note: card.note || "" }
    : { name: "", brandId: null, number: "", format: "", color: PALETTE[5], photo: null, note: "" };
  $("editorTitle").textContent = card ? "Modifica carta" : "Nuova carta";
  $("fName").value = draft.name;
  $("fNumber").value = draft.number;
  $("fFormat").value = draft.format;
  $("fNote").value = draft.note;
  refreshEditor();
  $("editor").querySelector(".sheet-body").scrollTop = 0;
  openOverlay($("editor"), () => { draft = null; });
}

$("fab").addEventListener("click", () => openEditor(null));
$("btnAddEmpty").addEventListener("click", () => openEditor(null));

$("fName").addEventListener("input", (e) => {
  draft.name = e.target.value;
  const brand = exactBrand(draft.name);
  draft.brandId = brand ? brand.id : null;
  if (!colorTouched) draft.color = brand ? brand.bg : draft.name.trim() ? colorForName(draft.name) : PALETTE[5];
  refreshEditor();
});
$("fName").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("fNumber").focus(); }
});
$("fNumber").addEventListener("input", (e) => { draft.number = e.target.value.trim(); refreshEditor(); });
$("fFormat").addEventListener("change", (e) => { draft.format = e.target.value; refreshEditor(); });
$("fNote").addEventListener("input", (e) => { draft.note = e.target.value.trim(); refreshEditor(); });

function applyScan(result) {
  draft.number = result.value.trim();
  draft.format = result.format;
  $("fNumber").value = draft.number;
  $("fFormat").value = draft.format;
  refreshEditor();
  if (navigator.vibrate) navigator.vibrate(60);
}

$("scanPhotoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const r = await scanImage(await loadImage(file));
    if (r) { applyScan(r); toast("Codice trovato"); }
    else toast("Nessun codice trovato nella foto");
  } catch (_) {
    toast("Impossibile leggere l'immagine");
  }
});

$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const img = await loadImage(file);
    draft.photo = photoToDataURL(img);
    const c = dominantColor(img);
    if (c && !colorTouched) draft.color = c;
    refreshEditor();
    if (!draft.number) {
      const r = await scanImage(img);
      if (r) { applyScan(r); toast("Codice trovato anche nella foto"); }
    }
  } catch (_) {
    toast("Impossibile leggere l'immagine");
  }
});
$("btnPhotoRemove").addEventListener("click", () => { draft.photo = null; refreshEditor(); });

$("editorForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!draft.name.trim()) { toast("Scrivi il nome del negozio"); $("fName").focus(); return; }
  if (!draft.number) { toast("Manca il numero della carta"); $("fNumber").focus(); return; }

  const d = draftCard();
  const now = Date.now();
  const existing = cards.find((c) => c.id === editingId);
  const card = {
    ...(existing || { id: newId(), createdAt: now, uses: 0 }),
    name: d.name.trim(), brandId: d.brandId, number: d.number, format: d.format,
    color: d.color, fg: d.fg, photo: d.photo, note: d.note, updatedAt: now,
  };
  await putCard(card);
  cards = existing ? cards.map((c) => (c.id === card.id ? card : c)) : [...cards, card];
  requestPersistence();
  closeTop();
  if (detailId === card.id) fillDetail(card);
  renderHome();
  toast(existing ? "Carta aggiornata" : "Carta aggiunta");
});

/* ---------- Scanner ---------- */

const scanner = new CameraScanner($("scanVideo"));
let torchOn = false;

$("btnScan").addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast("Fotocamera non disponibile: usa «Da foto»");
    return;
  }
  const el = $("scanner");
  el.classList.remove("found");
  $("scanMsg").textContent = "Inquadra il codice a barre o il QR della carta";
  torchOn = false;
  $("btnTorch").classList.remove("active");
  openOverlay(el, () => scanner.stop());
  try {
    await scanner.start((result) => {
      el.classList.add("found");
      applyScan(result);
      setTimeout(() => { if (isTop(el)) closeTop(); }, 250);
      toast("Codice acquisito");
    });
    $("btnTorch").hidden = !scanner.hasTorch();
  } catch (err) {
    closeTop();
    toast(err && err.name === "NotAllowedError" ? "Permesso fotocamera negato" : "Impossibile aprire la fotocamera");
  }
});

$("btnTorch").addEventListener("click", async () => {
  torchOn = !torchOn;
  try {
    await scanner.setTorch(torchOn);
    $("btnTorch").classList.toggle("active", torchOn);
  } catch (_) {
    torchOn = false;
  }
});

/* ---------- Menu: sort, backup, info ---------- */

const SORT_LABEL = { recent: "Usate di recente", name: "Nome" };
const THEME_LABEL = { auto: "Automatico", light: "Chiaro", dark: "Scuro" };
const THEME_BG = { light: "#F3F2EF", dark: "#2B2A28" };
let themeMode = settings.get("theme", "auto");

// "auto" follows the system; light/dark pin the palette and the browser bar color.
function applyTheme() {
  const root = document.documentElement;
  if (themeMode === "auto") delete root.dataset.theme;
  else root.dataset.theme = themeMode;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const scheme = m.media.includes("dark") ? "dark" : "light";
    m.content = THEME_BG[themeMode === "auto" ? scheme : themeMode];
  });
}
applyTheme();

function refreshMenu() {
  $("mSortVal").textContent = SORT_LABEL[sortMode];
  $("mThemeVal").textContent = THEME_LABEL[themeMode];
}

$("mTheme").addEventListener("click", () => {
  themeMode = { auto: "light", light: "dark", dark: "auto" }[themeMode];
  settings.set("theme", themeMode);
  applyTheme();
  refreshMenu();
});

$("btnMenu").addEventListener("click", () => { refreshMenu(); openOverlay($("menu")); });

$("mSort").addEventListener("click", () => {
  sortMode = sortMode === "recent" ? "name" : "recent";
  settings.set("sort", sortMode);
  refreshMenu();
  renderHome();
});

$("mExport").addEventListener("click", () => {
  if (!cards.length) { toast("Nessuna carta da esportare"); return; }
  const data = { app: "stripes", version: 1, exportedAt: new Date().toISOString(), cards };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stripes-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Backup esportato");
});

const HEX = /^#[0-9A-F]{6}$/i;
function sanitize(c) {
  if (!c || typeof c.name !== "string" || typeof c.number !== "string" || !c.name.trim() || !c.number.trim()) return null;
  const color = HEX.test(c.color) ? c.color.toUpperCase() : colorForName(c.name);
  const photo = typeof c.photo === "string" && c.photo.startsWith("data:image/") ? c.photo : null;
  return {
    id: typeof c.id === "string" && c.id ? c.id : newId(),
    name: c.name.trim().slice(0, 40),
    brandId: brandById(c.brandId) ? c.brandId : null,
    number: c.number.trim().slice(0, 512),
    format: formatById(c.format).id,
    color,
    fg: HEX.test(c.fg) ? c.fg : textOn(color),
    photo,
    note: typeof c.note === "string" ? c.note.slice(0, 80) : "",
    createdAt: Number(c.createdAt) || Date.now(),
    updatedAt: Number(c.updatedAt) || Date.now(),
    lastUsed: Number(c.lastUsed) || 0,
    uses: Number(c.uses) || 0,
  };
}

$("importInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = (Array.isArray(data) ? data : data.cards || []).map(sanitize).filter(Boolean);
    if (!list.length) { toast("Nessuna carta valida nel file"); return; }
    await putCards(list);
    cards = await allCards();
    renderHome();
    closeTop();
    toast(list.length === 1 ? "1 carta importata" : `${list.length} carte importate`);
  } catch (_) {
    toast("File di backup non valido");
  }
});

$("mAbout").addEventListener("click", async () => {
  await closeTop();
  confirmDialog({
    title: "Stripes",
    text: "Le carte restano solo su questo dispositivo: nessun account, nessun server.\n\nFunziona offline. Aggiungila alla schermata Home per usarla come un'app, ed esporta un backup ogni tanto.",
    ok: "",
    cancel: "Ok",
  });
});

/* ---------- Boot ---------- */

async function boot() {
  if (history.state && history.state.depth) history.replaceState(null, "");
  try {
    cards = await allCards();
  } catch (_) {
    toast("Archivio non disponibile in questa modalità");
  }
  renderHome();
  if (cards.length) requestPersistence();
}
boot();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
