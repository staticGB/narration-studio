// Runs Kokoro for the non-English language pages in a background thread.
// Each page sends its language; this file turns text into pronunciation symbols for that language
// (phon-*.js), then Kokoro turns the symbols into speech.
const KOKORO_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";
const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const EPHONE_URL = "https://cdn.jsdelivr.net/npm/ephone@1.0.2/ephone.js";
const KUROMOJI_URL = "https://cdn.jsdelivr.net/npm/@patdx/kuromoji@1.0.4/build/index.mjs";
const KUROMOJI_DICT = "https://cdn.jsdelivr.net/npm/@aiktb/kuromoji@1.0.2/dict/";
const PINYIN_URL = "https://cdn.jsdelivr.net/npm/pinyin-pro@3.29.4/+esm";

let tts = null;
let cancelFlag = false;
const phonemizers = {};

const tick = () => new Promise(r => setTimeout(r));

async function loadKokoro() {
  if (tts) return tts;
  const { KokoroTTS } = await import(KOKORO_URL);
  // Is the model already saved on this device? (Decides what the progress text says.)
  let cached = false;
  try { cached = !!(await caches.match(`https://huggingface.co/${KOKORO_MODEL}/resolve/main/onnx/model_quantized.onnx`)); } catch {}
  console.log("[voice model]", cached ? "found a saved copy on this device" : "not saved yet, downloading");
  if (cached) self.postMessage({ type: "progress", percent: 0, text: "Loading the saved voice model from this device..." });
  const files = {};
  tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: p => {
      if (p.status === "progress" && p.file) {
        files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
        let L = 0, T = 0;
        for (const f of Object.values(files)) { L += f.loaded; T += f.total; }
        if (T) self.postMessage({ type: "progress", percent: (L / T) * 100,
          text: cached ? `Loading the saved voice model from this device... ${Math.round((L / T) * 100)}%`
          : `Downloading voice model: ${(L / 1e6).toFixed(0)} of ${(T / 1e6).toFixed(0)} MB (first time only)` });
      }
    }
  });
  return tts;
}

async function getPhonemizer(lang) {
  if (phonemizers[lang]) return phonemizers[lang];
  self.postMessage({ type: "progress", percent: 0, text: "Loading pronunciation tools (first time may take a while)..." });
  let p;
  if (["es", "fr", "it", "pt", "hi"].includes(lang)) {
    const [{ create }, ephone] = await Promise.all([import("./phon-romance.js"), import(EPHONE_URL)]);
    p = await create(lang, ephone);
  } else if (lang === "ja") {
    const [{ create }, kuromoji] = await Promise.all([import("./phon-ja.js"), import(KUROMOJI_URL)]);
    self.postMessage({ type: "progress", percent: 0, text: "Downloading the Japanese dictionary (first time only, large)..." });
    p = await create(kuromoji, KUROMOJI_DICT);
  } else if (lang === "zh") {
    const [{ createFromPinyin }, pinyinPro] = await Promise.all([import("./phon-zh.js"), import(PINYIN_URL)]);
    p = createFromPinyin(pinyinPro);
  } else {
    throw new Error("Unsupported language: " + lang);
  }
  phonemizers[lang] = p;
  return p;
}

// jobs: [{ text, voice, speed }]
async function generate({ lang, jobs }) {
  cancelFlag = false;
  let phon, engine;
  try {
    phon = await getPhonemizer(lang);
    engine = await loadKokoro();
  } catch (e) {
    self.postMessage({ type: "error", stage: "load", message: String((e && e.message) || e) });
    return;
  }
  for (let i = 0; i < jobs.length; i++) {
    if (cancelFlag) { self.postMessage({ type: "cancelled" }); return; }
    const j = jobs[i];
    let audio;
    try {
      const ps = await phon(j.text);
      if (!ps || !ps.trim()) {
        audio = new Float32Array(4800); // nothing readable in this text: short silence
      } else {
        const { input_ids } = engine.tokenizer(ps, { truncation: true });
        const out = await engine.generate_from_ids(input_ids, { voice: j.voice, speed: j.speed });
        audio = out.audio.slice();
      }
    } catch (e) {
      self.postMessage({ type: "error", stage: "run", message: String((e && e.message) || e) });
      return;
    }
    self.postMessage({ type: "chunk", index: i, total: jobs.length, rate: 24000, audio }, [audio.buffer]);
    await tick();
  }
  self.postMessage({ type: "done" });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "generate") await generate(data);
    else if (data.type === "cancel") cancelFlag = true;
  } catch (e) {
    self.postMessage({ type: "error", stage: "run", message: String((e && e.message) || e) });
  }
};
