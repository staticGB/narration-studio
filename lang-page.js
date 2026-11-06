// Shared page code for the Kokoro language pages (cast, script, preview, generate, save).
/* PURE:START (no page access below this line until PURE:END) */
function splitText(text, maxLen = 280) {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || [text];
  const chunks = []; let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > maxLen && cur) { chunks.push(cur.trim()); cur = ""; }
    if (s.length > maxLen) {
      let rest = s.trim();
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf(" ", maxLen);
        if (cut < maxLen / 2) cut = maxLen;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) chunks.push(rest);
    } else cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.filter(Boolean);
}

function floatToWav(float32, sampleRate) {
  const buffer = new ArrayBuffer(44 + float32.length * 2);
  const v = new DataView(buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + float32.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, float32.length * 2, true);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Turns the script text into a list of items: speech lines, pauses. Also returns warnings.
function parseScript(raw, cast) {
  const items = [], warnings = [];
  const byName = new Map();
  cast.forEach(c => {
    const k = c.name.trim().toLowerCase();
    if (!k) return;
    if (byName.has(k)) warnings.push(`Two characters are named "${c.name.trim()}". The first one is used.`);
    else byName.set(k, c);
  });
  const narrator = cast[0];
  let blankPending = false;

  raw.split(/\r?\n/).forEach((line, idx) => {
    const n = idx + 1;
    let t = line.trim();
    if (!t) { blankPending = items.length > 0; return; }
    if (blankPending) {
      if (items[items.length - 1].type === "speech") items.push({ type: "pause", sec: 0.4, auto: true });
      blankPending = false;
    }

    let m = t.match(/^\[pause(?:\s+([\d.]+))?\]\s*$/i);
    if (m) {
      let sec = m[1] ? parseFloat(m[1]) : 1;
      if (!isFinite(sec)) sec = 1;
      items.push({ type: "pause", sec: clamp(sec, 0, 30) });
      return;
    }

    let overlap = false, overlapSec = 0.6;
    m = t.match(/^\[overlap(?:\s+([\d.]+))?\]\s*/i);
    if (m) {
      overlap = true;
      if (m[1] && isFinite(parseFloat(m[1]))) overlapSec = clamp(parseFloat(m[1]), 0, 5);
      t = t.slice(m[0].length);
    }

    let speaker = narrator;
    m = t.match(/^(\p{L}[^:\[\]]{0,23}?)\s*:\s*(.*)$/u);
    if (m && m[1].trim().split(/\s+/).length <= 2) {
      const c = byName.get(m[1].trim().toLowerCase());
      if (c) { speaker = c; t = m[2]; }
      else warnings.push(`Line ${n}: "${m[1].trim()}" isn't in your cast, so the Narrator reads the whole line including that word. Add a character with that name to fix it.`);
    }

    t = t.replace(/\[[^\]]*\]/g, tag => { warnings.push(`Line ${n}: ${tag} isn't a direction the app knows, so it is skipped.`); return " "; })
         .replace(/\s+/g, " ").trim();
    if (!t) return;

    if (overlap && !items.some(i => i.type === "speech")) {
      warnings.push(`Line ${n}: [overlap] has no earlier line to overlap, so it is ignored.`);
      overlap = false;
    }
    items.push({ type: "speech", speaker: speaker.name, voice: speaker.voice, text: t, overlap, overlapSec, line: n });
  });
  return { items, warnings };
}

// Places every spoken line on a timeline (overlapping where asked) and mixes them into one buffer.
function mixToWav(items, results) {
  const GAP = 0.18;
  const first = results.find(Boolean);
  const rate = first.rate;
  const placed = [];
  let end = 0, prev = null;

  for (const it of items) {
    if (it.type === "pause") { end += it.sec; continue; }
    const parts = [];
    it.jobIdx.forEach((j, k) => {
      if (k) parts.push(new Float32Array(Math.round(rate * GAP)));
      parts.push(results[j].audio);
    });
    const len = parts.reduce((a, p) => a + p.length, 0);
    const audio = new Float32Array(len);
    let o = 0; parts.forEach(p => { audio.set(p, o); o += p.length; });
    const dur = len / rate;

    let start;
    if (it.overlap && prev) start = Math.max(prev.start, prev.end - it.overlapSec);
    else start = end > 0 ? end + GAP : 0;

    placed.push({ start, audio });
    prev = { start, end: start + dur };
    end = Math.max(end, start + dur);
  }

  const out = new Float32Array(Math.ceil(end * rate) + 2);
  for (const p of placed) {
    const s = Math.round(p.start * rate);
    for (let i = 0; i < p.audio.length; i++) out[s + i] += p.audio[i];
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  if (peak > 0.99) { const g = 0.99 / peak; for (let i = 0; i < out.length; i++) out[i] *= g; }
  return { wav: floatToWav(out, rate), seconds: out.length / rate };
}
/* PURE:END */

/* ============ Page ============ */
let CFG = null;
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let textEl, speedEl, castEl, toolbarEl, playBtn, stopBtn, saveBtn, statusEl, progWrap, progEl, pvSummary, pvBody;
let nextId = 1;
let cast = [];
let VOICE_MAP = {};
let busy = false, cancelRequested = false;
let audioEl = null, audioUrl = null, wavBlob = null, previewAudio = null;
const previewCache = new Map();
const key = k => `nk.${CFG.lang}.${k}`;

function toast(msg, type = "info") {
  const t = $("toast");
  t.textContent = msg; t.className = "show " + (type === "error" ? "error" : "");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = "", 6000);
}
function setStatus(s) { statusEl.textContent = s; }
function setProgress(p) { progWrap.hidden = p == null; if (p != null) progEl.style.width = clamp(p, 0, 100) + "%"; }
function syncControls() {
  playBtn.disabled = busy || !textEl.value.trim();
  document.querySelectorAll(".btn-preview").forEach(b => b.disabled = busy);
  $("btn-sample").disabled = busy;
}
function showIdle() { playBtn.hidden = false; stopBtn.hidden = true; }
function invalidateAudio() {
  wavBlob = null; saveBtn.hidden = true;
  if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
}
function stopAudios() {
  if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
  if (previewAudio) { previewAudio.pause(); previewAudio.currentTime = 0; }
}

/* ---------- Saved settings ---------- */
function persist() {
  try {
    localStorage.setItem(key("cast"), JSON.stringify(cast.map(c => ({ name: c.name, voice: c.voice }))));
    localStorage.setItem(key("text"), textEl.value);
    localStorage.setItem(key("speed"), speedEl.value);
  } catch {}
}
function restore() {
  try {
    const c = JSON.parse(localStorage.getItem(key("cast")));
    if (Array.isArray(c) && c.length && c.every(x => x && typeof x.name === "string" && VOICE_MAP[x.voice])) {
      cast = c.map((x, i) => ({ id: nextId++, name: i === 0 ? "Narrator" : x.name, voice: x.voice }));
    }
    const t = localStorage.getItem(key("text")); if (t) textEl.value = t;
    const s = parseFloat(localStorage.getItem(key("speed"))); if (s >= 0.6 && s <= 1.5) speedEl.value = s;
  } catch {}
}

/* ---------- Cast ---------- */
function buildVoiceSelect(selected) {
  const sel = el("select");
  CFG.voices.forEach(([id, name, kind]) => sel.add(new Option(`${name} (${kind})`, id)));
  sel.value = selected;
  return sel;
}
function pickVoice() {
  const used = new Set(cast.map(c => c.voice));
  const free = CFG.voices.find(v => !used.has(v[0]));
  return (free || CFG.voices[cast.length % CFG.voices.length])[0];
}
function uniqueName(base) {
  const names = new Set(cast.map(c => c.name.trim().toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let i = 2; while (names.has(`${base} ${i}`.toLowerCase())) i++;
  return `${base} ${i}`;
}
function addCharacter(name) {
  const c = { id: nextId++, name: name || uniqueName("Character"), voice: pickVoice() };
  cast.push(c); return c;
}
function renderCast() {
  castEl.replaceChildren();
  cast.forEach((c, i) => {
    const row = el("div", "cast-row"); row.dataset.id = c.id;
    const name = el("input"); name.type = "text"; name.value = c.name; name.maxLength = 24;
    name.setAttribute("aria-label", "Character name");
    if (i === 0) name.readOnly = true;
    const sel = buildVoiceSelect(c.voice); sel.setAttribute("aria-label", `Voice for ${c.name}`);
    const prev = el("button", "secondary small btn-preview", "Preview"); prev.type = "button";
    const rm = el("button", "secondary small", "Remove"); rm.type = "button";
    row.append(name, sel, prev);
    if (i === 0) row.append(el("span", "spacer")); else row.append(rm);
    castEl.append(row);
  });
  syncControls();
}
function renderToolbar() {
  toolbarEl.replaceChildren();
  toolbarEl.append(el("span", "label", "Add a line for:"));
  cast.forEach(c => {
    if (!c.name.trim()) return;
    const b = el("button", "secondary small", c.name.trim()); b.type = "button"; b.dataset.char = c.id;
    toolbarEl.append(b);
  });
  toolbarEl.append(el("span", "divider"));
  const p = el("button", "secondary small", "Pause"); p.type = "button"; p.dataset.insert = "pause";
  const o = el("button", "secondary small", "Overlap"); o.type = "button"; o.dataset.insert = "overlap";
  toolbarEl.append(p, o);
}

/* ---------- Inserting directions ---------- */
function lineBounds(pos) {
  const v = textEl.value;
  const s = v.lastIndexOf("\n", pos - 1) + 1;
  let e = v.indexOf("\n", pos); if (e === -1) e = v.length;
  return [s, e];
}
function commit(newVal, caret) {
  textEl.value = newVal; textEl.focus(); textEl.setSelectionRange(caret, caret);
  textEl.dispatchEvent(new Event("input"));
}
function insertOnNewLine(snippet) {
  const v = textEl.value, [s, e] = lineBounds(textEl.selectionStart), line = v.slice(s, e);
  if (/^\s*\[overlap[^\]]*\]\s*$/i.test(line)) {
    const add = (line.endsWith(" ") ? "" : " ") + snippet;
    return commit(v.slice(0, e) + add + v.slice(e), e + add.length);
  }
  if (line.trim() === "") return commit(v.slice(0, s) + snippet + v.slice(e), s + snippet.length);
  commit(v.slice(0, e) + "\n" + snippet + v.slice(e), e + 1 + snippet.length);
}
function insertOverlap() {
  const v = textEl.value, [s, e] = lineBounds(textEl.selectionStart);
  if (/^\s*\[overlap/i.test(v.slice(s, e))) return textEl.focus();
  commit(v.slice(0, s) + "[overlap] " + v.slice(s), textEl.selectionStart + 10);
}

/* ---------- Script preview ---------- */
let pvTimer = null;
function schedulePreview() { clearTimeout(pvTimer); pvTimer = setTimeout(renderScriptPreview, 200); }
function renderScriptPreview() {
  const { items, warnings } = parseScript(textEl.value, cast);
  const n = items.filter(i => i.type === "speech").length;
  pvSummary.textContent = n
    ? `Script preview: ${n} line${n === 1 ? "" : "s"}${warnings.length ? `, ${warnings.length} to check` : ""}`
    : "Script preview";
  pvSummary.classList.toggle("warn", warnings.length > 0);
  pvBody.replaceChildren();
  if (!items.length) { pvBody.append(el("p", "hint", "Nothing to read yet. Type or paste some text above.")); return; }
  warnings.forEach(w => pvBody.append(el("div", "pv-warn", w)));
  items.forEach(it => {
    const row = el("div", "pv-row");
    if (it.type === "pause") {
      row.append(el("div", "pv-who"), el("div", "pv-pause", it.auto ? "paragraph pause" : `pause ${it.sec} s`));
    } else {
      const who = el("div", "pv-who", it.speaker);
      who.append(el("div", "pv-voice", VOICE_MAP[it.voice]?.name || it.voice));
      const txt = el("div"); txt.dir = "auto";
      if (it.overlap) txt.append(el("span", "pv-tag", `overlaps by ${it.overlapSec} s`));
      txt.append(document.createTextNode(it.text));
      row.append(who, txt);
    }
    pvBody.append(row);
  });
}

/* ---------- Voice worker ---------- */
let worker = null;
const handlers = {};
function startWorker() {
  if (worker) return worker;
  worker = new Worker("./kokoro-lang-worker.js", { type: "module" });
  worker.onmessage = e => handlers[e.data.type]?.(e.data);
  worker.onerror = e => handlers.error?.({ stage: "load", message: e.message || "The voice worker failed to start." });
  return worker;
}
function friendlyError(m) {
  console.error(m);
  if (m.stage === "load") return `Couldn't load the ${CFG.title} voice tools. The first use needs internet. Details are in the console (F12).`;
  return `The voice failed while generating. Details are in the console (F12).`;
}
// jobs: [{ text, voice, speed }] -> [{ audio, rate }] (null if cancelled)
function runJob(jobs, onChunk) {
  return new Promise((resolve, reject) => {
    const w = startWorker();
    const results = new Array(jobs.length);
    setStatus("Loading voice engine..."); setProgress(0);
    handlers.progress = m => { setProgress(m.percent); setStatus(m.text); };
    handlers.chunk = m => { results[m.index] = { audio: m.audio, rate: m.rate }; onChunk?.(m.index + 1, m.total); };
    handlers.done = () => resolve(results);
    handlers.cancelled = () => resolve(null);
    handlers.error = m => reject(new Error(friendlyError(m)));
    w.postMessage({ type: "generate", lang: CFG.lang, jobs });
  });
}

/* ---------- Previews ---------- */
async function previewVoice(voiceId, btn) {
  if (busy) return;
  stopAudios();
  const label = btn.textContent;
  let url = previewCache.get(voiceId);
  try {
    if (!url) {
      cancelRequested = false; busy = true; syncControls(); btn.textContent = "...";
      const res = await runJob([{ text: CFG.preview, voice: voiceId, speed: 1 }]);
      if (!res) return;
      url = URL.createObjectURL(new Blob([floatToWav(res[0].audio, res[0].rate)], { type: "audio/wav" }));
      previewCache.set(voiceId, url);
    }
    previewAudio = new Audio(url);
    await previewAudio.play();
  } catch (e) {
    console.error(e); toast(e.message, "error");
  } finally {
    btn.textContent = label; busy = false; setStatus(""); setProgress(null); syncControls();
  }
}

/* ---------- Generate ---------- */
async function generateAndPlay() {
  if (busy) return;
  stopAudios(); invalidateAudio();
  const { items } = parseScript(textEl.value, cast);
  const speech = items.filter(i => i.type === "speech");
  if (!speech.length) { toast("There's nothing to read yet."); return; }
  const speed = parseFloat(speedEl.value);
  const jobs = [];
  speech.forEach(it => {
    it.jobIdx = [];
    splitText(it.text, CFG.maxChars || 280).forEach(c => { it.jobIdx.push(jobs.length); jobs.push({ text: c, voice: it.voice, speed }); });
  });
  cancelRequested = false; busy = true; syncControls();
  playBtn.hidden = true; stopBtn.hidden = false;
  try {
    const res = await runJob(jobs, (n, t) => { setStatus(`Generating audio: part ${n} of ${t}`); setProgress(n / t * 100); });
    setProgress(null);
    if (!res) { setStatus("Stopped."); showIdle(); return; }
    const { wav, seconds } = mixToWav(items, res);
    wavBlob = new Blob([wav], { type: "audio/wav" });
    audioUrl = URL.createObjectURL(wavBlob);
    audioEl = new Audio(audioUrl);
    audioEl.onended = () => { showIdle(); setStatus("Finished."); };
    saveBtn.hidden = false;
    setStatus(`Playing (${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")})...`);
    await audioEl.play();
  } catch (e) {
    console.error(e);
    setProgress(null); setStatus(""); showIdle();
    toast(e.message || "Couldn't generate the audio.", "error");
  } finally {
    busy = false; syncControls();
  }
}
function stopAll() {
  cancelRequested = true;
  stopAudios();
  if (worker) worker.postMessage({ type: "cancel" });
  showIdle(); setStatus("Stopped.");
}
function saveWav() {
  if (!wavBlob) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(wavBlob); a.download = `narration_${CFG.lang}.wav`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Audio saved.");
}

/* ---------- Start ---------- */
export function start(config) {
  CFG = config;
  CFG.voices.forEach(([id, name, kind]) => VOICE_MAP[id] = { name, kind });
  textEl = $("text"); speedEl = $("speed"); castEl = $("cast"); toolbarEl = $("toolbar");
  playBtn = $("btn-play"); stopBtn = $("btn-stop"); saveBtn = $("btn-save");
  statusEl = $("status"); progWrap = $("progress-wrap"); progEl = $("progress");
  pvSummary = $("pv-summary"); pvBody = $("pv-body");
  cast = [{ id: nextId++, name: "Narrator", voice: CFG.voices[0][0] }];

  castEl.addEventListener("input", e => {
    if (e.target.matches("input[type=text]")) {
      const c = cast.find(x => x.id == e.target.closest(".cast-row").dataset.id);
      const cleaned = e.target.value.replace(/[:：\[\]]/g, "");
      if (cleaned !== e.target.value) e.target.value = cleaned;
      c.name = cleaned; renderToolbar(); schedulePreview(); persist();
    }
  });
  castEl.addEventListener("change", e => {
    if (e.target.matches("select")) {
      const c = cast.find(x => x.id == e.target.closest(".cast-row").dataset.id);
      c.voice = e.target.value; invalidateAudio(); schedulePreview(); persist();
    }
  });
  castEl.addEventListener("click", e => {
    const row = e.target.closest(".cast-row"); if (!row) return;
    const c = cast.find(x => x.id == row.dataset.id);
    if (e.target.classList.contains("btn-preview")) previewVoice(c.voice, e.target);
    else if (e.target.textContent === "Remove") {
      cast = cast.filter(x => x !== c); renderCast(); renderToolbar(); schedulePreview(); persist();
    }
  });
  $("btn-add-char").addEventListener("click", () => { addCharacter(); renderCast(); renderToolbar(); schedulePreview(); persist(); });
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.char) { const c = cast.find(x => x.id == b.dataset.char); if (c) insertOnNewLine(`${c.name.trim()}: `); }
    else if (b.dataset.insert === "pause") insertOnNewLine("[pause 1.5]");
    else if (b.dataset.insert === "overlap") insertOverlap();
  });
  textEl.addEventListener("input", () => { invalidateAudio(); syncControls(); schedulePreview(); persist(); });
  speedEl.addEventListener("input", () => { $("speed-val").textContent = String(parseFloat(speedEl.value)); persist(); });
  speedEl.addEventListener("change", invalidateAudio);
  playBtn.addEventListener("click", generateAndPlay);
  stopBtn.addEventListener("click", stopAll);
  saveBtn.addEventListener("click", saveWav);
  $("btn-sample").addEventListener("click", () => {
    CFG.sample.cast.forEach(name => { if (!cast.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) addCharacter(name); });
    renderCast(); renderToolbar();
    textEl.value = CFG.sample.text; invalidateAudio(); syncControls(); schedulePreview(); persist();
  });

  restore();
  $("speed-val").textContent = String(parseFloat(speedEl.value));
  renderCast(); renderToolbar(); renderScriptPreview(); syncControls();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(e => console.warn("Offline cache unavailable:", e));
  }
}
