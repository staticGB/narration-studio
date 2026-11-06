// Turns Mandarin text into Kokoro pronunciation symbols.
// Ported from Kokoro's own converter (misaki, original mode): pinyin -> IPA with tone arrows.
// Differences: word splitting uses the browser's built-in segmenter, and pinyin comes from pinyin-pro.

const INITIAL = { b: "p", c: "ʦʰ", ch: "ꭧʰ", d: "t", f: "f", g: "k", h: "x", j: "ʨ", k: "kʰ", l: "l", m: "m", n: "n", p: "pʰ", q: "ʨʰ", r: "ɻ", s: "s", sh: "ʂ", t: "tʰ", x: "ɕ", z: "ʦ", zh: "ꭧ" };
const INTERJECTION = { io: ["j", "ɔ0"], "ê": ["ɛ0"], er: ["ɚ0"], o: ["ɔ0"] };
const SYLLABIC = { hm: ["h", "m0"], hng: ["h", "ŋ0"], m: ["m0"], n: ["n0"], ng: ["ŋ0"] };
const FINAL = {
  a: ["a0"], ai: ["ai̯0"], an: ["a0", "n"], ang: ["a0", "ŋ"], ao: ["au̯0"], e: ["ɤ0"], ei: ["ei̯0"], en: ["ə0", "n"], eng: ["ə0", "ŋ"],
  i: ["i0"], ia: ["j", "a0"], ian: ["j", "ɛ0", "n"], iang: ["j", "a0", "ŋ"], iao: ["j", "au̯0"], ie: ["j", "e0"], in: ["i0", "n"],
  iou: ["j", "ou̯0"], ing: ["i0", "ŋ"], iong: ["j", "ʊ0", "ŋ"], ong: ["ʊ0", "ŋ"], ou: ["ou̯0"], u: ["u0"],
  uei: ["w", "ei̯0"], ua: ["w", "a0"], uai: ["w", "ai̯0"], uan: ["w", "a0", "n"], uen: ["w", "ə0", "n"], uang: ["w", "a0", "ŋ"], ueng: ["w", "ə0", "ŋ"],
  uo: ["w", "o0"], o: ["w", "o0"],
  "ü": ["y0"], "üe": ["ɥ", "e0"], "üan": ["ɥ", "ɛ0", "n"], "ün": ["y0", "n"]
};
const AFTER_ZH_CH_SH_R = { i: ["ɻ\u0329" + "0"] };
const AFTER_Z_C_S = { i: ["ɹ\u0329" + "0"] };
const TONE = { 1: "˥", 2: "˧˥", 3: "˧˩˧", 4: "˥˩", 5: "" };

function retone(p) {
  p = p.replace(/˧˩˧/g, "↓").replace(/˧˥/g, "↗").replace(/˥˩/g, "↘").replace(/˥/g, "→");
  return p.replace(/ɻ\u0329/g, "ɨ").replace(/ɹ\u0329/g, "ɨ");
}

// "ni3" -> IPA with tone arrows. Tone 0 (light) is treated as 5.
export function syllableToIpa(py) {
  const m = py.toLowerCase().replace(/v/g, "ü").match(/^([a-zêü]+)([0-5])?$/);
  if (!m) return "";
  const tone = TONE[m[2] && m[2] !== "0" ? +m[2] : 5];
  const normal = m[1];
  const apply = arr => arr.map(p => p.replace("0", tone)).join("");
  if (INTERJECTION[normal]) return retone(apply(INTERJECTION[normal]));
  if (SYLLABIC[normal]) return retone(apply(SYLLABIC[normal]));

  const im = normal.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/);
  let initial = im ? im[1] : "";
  let rest = normal.slice(initial.length);
  if (!initial) {
    if (rest === "yi" || rest === "yin" || rest === "ying") rest = rest.slice(1);
    else if (rest.startsWith("yu")) rest = "ü" + rest.slice(2);
    else if (rest.startsWith("y")) rest = "i" + rest.slice(1);
    else if (rest === "wu") rest = "u";
    else if (rest.startsWith("w")) rest = "u" + rest.slice(1);
  } else if ("jqx".includes(initial)) {
    if (rest === "u") rest = "ü"; else if (rest === "ue") rest = "üe"; else if (rest === "uan") rest = "üan"; else if (rest === "un") rest = "ün";
  } else {
    if (rest === "iu") rest = "iou"; else if (rest === "ui") rest = "uei"; else if (rest === "un") rest = "uen";
  }
  let fin;
  if (["zh", "ch", "sh", "r"].includes(initial) && AFTER_ZH_CH_SH_R[rest]) fin = AFTER_ZH_CH_SH_R[rest];
  else if (["z", "c", "s"].includes(initial) && AFTER_Z_C_S[rest]) fin = AFTER_Z_C_S[rest];
  else fin = FINAL[rest];
  if (!fin) return "";
  return retone((initial ? INITIAL[initial] : "") + apply(fin));
}

// Simple Arabic-numeral reader for Chinese (everyday numbers).
const ZD = "零一二三四五六七八九";
function numToZh(str) {
  if (!/^\d+$/.test(str) || str.length > 12 || (str.length > 1 && str[0] === "0")) return [...str].map(d => ZD[+d]).join("");
  let n = Number(str);
  if (n === 0) return "零";
  const sect = (x, full) => {
    let out = "", zero = false;
    const units = ["", "十", "百", "千"];
    const ds = String(x).padStart(4, "0");
    for (let i = 0; i < 4; i++) {
      const d = +ds[i], u = units[3 - i];
      if (d === 0) { if (out) zero = true; continue; }
      if (zero) { out += "零"; zero = false; }
      out += (d === 1 && u === "十" && !out && !full ? "" : ZD[d]) + u;
    }
    return out;
  };
  const yi = Math.floor(n / 1e8), wan = Math.floor((n % 1e8) / 1e4), rest = n % 1e4;
  let out = "";
  if (yi) out += sect(yi, true) + "亿";
  if (wan) out += (out && wan < 1000 ? "零" : "") + sect(wan, !!out) + "万";
  if (rest) out += (out && rest < 1000 ? "零" : "") + sect(rest, !!out);
  return out;
}

function mapPunctuation(text) {
  return text.replace(/[、，]/g, ", ").replace(/[。．]/g, ". ").replace(/！/g, "! ").replace(/：/g, ": ").replace(/；/g, "; ").replace(/？/g, "? ")
    .replace(/«/g, " “").replace(/»/g, "” ").replace(/《/g, " “").replace(/》/g, "” ").replace(/「/g, " “").replace(/」/g, "” ")
    .replace(/【/g, " “").replace(/】/g, "” ").replace(/（/g, " (").replace(/）/g, ") ").trim();
}

// pinyinPro: the loaded pinyin-pro library
export function createFromPinyin(pinyinPro) {
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("zh", { granularity: "word" }) : null;
  const wordToIpa = w => pinyinPro.pinyin(w, { toneType: "num", type: "array", toneSandhi: false }).map(syllableToIpa).join("");
  return async function phonemize(text) {
    if (!text || !text.trim()) return "";
    text = text.replace(/\d+/g, numToZh);
    text = mapPunctuation(text);
    let out = "";
    for (const seg of text.match(/[\u4E00-\u9FFF]+|[^\u4E00-\u9FFF]+/g) || []) {
      if (/^[\u4E00-\u9FFF]/.test(seg)) {
        const words = segmenter ? [...segmenter.segment(seg)].map(s => s.segment) : [seg];
        out += words.map(wordToIpa).join(" ");
      } else out += seg;
    }
    return out.replace(/\u032F/g, "");
  };
}
