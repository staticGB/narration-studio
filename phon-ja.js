// Turns Japanese text into Kokoro pronunciation symbols.
// Ported from Kokoro's own converter (misaki "cutlet" mode): kana -> phonemes using the same table and rules.
// Differences: kanji readings come from kuromoji (IPADIC) instead of MeCab (UniDic), and numbers use a simpler reader.

const HEPBURN = {"ぁ": "a", "あ": "a", "ぃ": "i", "い": "i", "ぅ": "ɯ", "う": "ɯ", "ぇ": "e", "え": "e", "ぉ": "o", "お": "o", "か": "ka", "が": "ɡa", "き": "kʲi", "ぎ": "ɡʲi", "く": "kɯ", "ぐ": "ɡɯ", "け": "ke", "げ": "ɡe", "こ": "ko", "ご": "ɡo", "さ": "sa", "ざ": "ʣa", "し": "ɕi", "じ": "ʥi", "す": "sɨ", "ず": "zɨ", "せ": "se", "ぜ": "ʣe", "そ": "so", "ぞ": "ʣo", "た": "ta", "だ": "da", "ち": "ʨi", "ぢ": "ʥi", "つ": "ʦɨ", "づ": "zɨ", "て": "te", "で": "de", "と": "to", "ど": "do", "な": "na", "に": "ɲi", "ぬ": "nɯ", "ね": "ne", "の": "no", "は": "ha", "ば": "ba", "ぱ": "pa", "ひ": "çi", "び": "bʲi", "ぴ": "pʲi", "ふ": "ɸɯ", "ぶ": "bɯ", "ぷ": "pɯ", "へ": "he", "べ": "be", "ぺ": "pe", "ほ": "ho", "ぼ": "bo", "ぽ": "po", "ま": "ma", "み": "mʲi", "む": "mɯ", "め": "me", "も": "mo", "ゃ": "ja", "や": "ja", "ゅ": "jɯ", "ゆ": "jɯ", "ょ": "jo", "よ": "jo", "ら": "ɾa", "り": "ɾʲi", "る": "ɾɯ", "れ": "ɾe", "ろ": "ɾo", "ゎ": "βa", "わ": "βa", "ゐ": "i", "ゑ": "e", "を": "o", "ゔ": "vɯ", "ゕ": "ka", "ゖ": "ke", "ヷ": "va", "ヸ": "vʲi", "ヹ": "ve", "ヺ": "vo", "いぇ": "je", "うぃ": "βi", "うぇ": "βe", "うぉ": "βo", "きぇ": "kʲe", "きゃ": "kʲa", "きゅ": "kʲɨ", "きょ": "kʲo", "ぎゃ": "ɡʲa", "ぎゅ": "ɡʲɨ", "ぎょ": "ɡʲo", "くぁ": "kᵝa", "くぃ": "kᵝi", "くぇ": "kᵝe", "くぉ": "kᵝo", "ぐぁ": "ɡᵝa", "ぐぃ": "ɡᵝi", "ぐぇ": "ɡᵝe", "ぐぉ": "ɡᵝo", "しぇ": "ɕe", "しゃ": "ɕa", "しゅ": "ɕɨ", "しょ": "ɕo", "じぇ": "ʥe", "じゃ": "ʥa", "じゅ": "ʥɨ", "じょ": "ʥo", "ちぇ": "ʨe", "ちゃ": "ʨa", "ちゅ": "ʨɨ", "ちょ": "ʨo", "ぢゃ": "ʥa", "ぢゅ": "ʥɨ", "ぢょ": "ʥo", "つぁ": "ʦa", "つぃ": "ʦʲi", "つぇ": "ʦe", "つぉ": "ʦo", "てぃ": "tʲi", "てゅ": "tʲɨ", "でぃ": "dʲi", "でゅ": "dʲɨ", "とぅ": "tɯ", "どぅ": "dɯ", "にぇ": "ɲe", "にゃ": "ɲa", "にゅ": "ɲɨ", "にょ": "ɲo", "ひぇ": "çe", "ひゃ": "ça", "ひゅ": "çɨ", "ひょ": "ço", "びゃ": "bʲa", "びゅ": "bʲɨ", "びょ": "bʲo", "ぴゃ": "pʲa", "ぴゅ": "pʲɨ", "ぴょ": "pʲo", "ふぁ": "ɸa", "ふぃ": "ɸʲi", "ふぇ": "ɸe", "ふぉ": "ɸo", "ふゅ": "ɸʲɨ", "ふょ": "ɸʲo", "みゃ": "mʲa", "みゅ": "mʲɨ", "みょ": "mʲo", "りゃ": "ɾʲa", "りゅ": "ɾʲɨ", "りょ": "ɾʲo", "ゔぁ": "va", "ゔぃ": "vʲi", "ゔぇ": "ve", "ゔぉ": "vo", "ゔゅ": "bʲɨ", "ゔょ": "bʲo", "。": ".", "、": ",", "？": "?", "！": "!", "「": "“", "」": "”", "『": "“", "』": "”", "：": ":", "；": ";", "（": "(", "）": ")", "《": "(", "》": ")", "【": "[", "】": "]", "・": " ", "，": ",", "～": "—", "〜": "—", "—": "—", "«": "“", "»": "”", "゚": "", "゙": ""};
const SUTEGANA = new Set("ゃゅょぁぃぅぇぉ");
const ODORI = new Set("〃々ゝゞヽ");
const KATA_EXT = { "ㇰ": "ク", "ㇱ": "シ", "ㇲ": "ス", "ㇳ": "ト", "ㇴ": "ヌ", "ㇵ": "ハ", "ㇶ": "ヒ", "ㇷ": "フ", "ㇸ": "ヘ", "ㇹ": "ホ", "ㇺ": "ム", "ㇻ": "ラ", "ㇼ": "リ", "ㇽ": "ル", "ㇾ": "レ", "ㇿ": "ロ" };

const kata2hira = s => s.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
const hasJapanese = s => /[\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\u3005\u30FC]/.test(s);

function addDakuten(k) {
  const i = "かきくけこさしすせそたちつてとはひふへほ".indexOf(k);
  return i < 0 ? null : "がぎぐげござじずぜぞだぢづでどばびぶべぼ"[i];
}

// Simple number reader (hiragana). Good for everyday numbers; not every irregular reading is covered.
const DIG = ["", "いち", "に", "さん", "よん", "ご", "ろく", "なな", "はち", "きゅう"];
function below10000(n) {
  let out = "";
  const th = Math.floor(n / 1000), h = Math.floor((n % 1000) / 100), t = Math.floor((n % 100) / 10), o = n % 10;
  if (th) out += th === 1 ? "せん" : th === 3 ? "さんぜん" : th === 8 ? "はっせん" : DIG[th] + "せん";
  if (h) out += h === 1 ? "ひゃく" : h === 3 ? "さんびゃく" : h === 6 ? "ろっぴゃく" : h === 8 ? "はっぴゃく" : DIG[h] + "ひゃく";
  if (t) out += t === 1 ? "じゅう" : DIG[t] + "じゅう";
  if (o) out += DIG[o];
  return out;
}
export function numToKana(str) {
  if (!/^\d+$/.test(str)) return str;
  if (str.length > 12 || (str.length > 1 && str[0] === "0")) return [...str].map(d => d === "0" ? "ぜろ" : DIG[+d]).join("");
  let n = Number(str);
  if (n === 0) return "ぜろ";
  const parts = [];
  const oku = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4;
  if (oku) parts.push((oku === 1 ? "いち" : below10000(oku)) + "おく");
  if (man) parts.push((man === 1 ? "いち" : below10000(man)) + "まん");
  if (rest) parts.push(below10000(rest));
  return parts.join("");
}

function normalize(text) {
  text = text.replace(/[〜～](?=\d)/g, "から");
  for (const [k, v] of Object.entries(KATA_EXT)) text = text.split(k).join(v);
  text = text.normalize("NFKC");
  return (text.match(/\d+|\D+/g) || []).map(t => /^\d+$/.test(t) ? " " + numToKana(t) : t).join("");
}

function singleMapping(pk, kk, nk) {
  if (ODORI.has(kk)) {
    if ("ゝヽ".includes(kk)) return pk || "";
    if ("ゞヾ".includes(kk)) { if (!pk) return ""; const v = addDakuten(pk); return v ? (HEPBURN[v] ?? "") : ""; }
    return "";
  }
  if (pk && (pk + kk) in HEPBURN) return HEPBURN[pk + kk];
  if (nk && (kk + nk) in HEPBURN) return "";
  if (nk && SUTEGANA.has(nk)) {
    if (kk === "っ") return "";
    return (HEPBURN[kk] ?? "").slice(0, -1) + HEPBURN[nk];
  }
  if (SUTEGANA.has(kk)) return "";
  if (kk === "ー") return "ː";
  if (kk === "っ") return "ʔ";
  if (kk === "ん") {
    const t = HEPBURN[nk];
    if (t) {
      if ("mpb".includes(t[0])) return "m";
      if ("kɡ".includes(t[0])) return "ŋ";
      if (["ɲ", "ʨ", "ʥ"].some(p => t.startsWith(p))) return "ɲ";
      if ("ntdɾz".includes(t[0])) return "n";
    }
    return "ɴ";
  }
  return HEPBURN[kk] ?? "";
}

function wordToPhonemes(surface, hira) {
  if (/^[\x00-\x7F]*$/.test(surface)) return surface;
  if (!hasJapanese(surface)) return [...surface].map(c => HEPBURN[c] ?? c).join("");
  let out = "";
  const chars = [...hira];
  for (let i = 0; i < chars.length; i++) out += singleMapping(chars[i - 1] ?? null, chars[i], chars[i + 1] ?? null);
  return out;
}

// kuromoji: the loaded kuromoji library, tokenizer: an already built tokenizer
export function createFromTokenizer(tokenizer) {
  return async function phonemize(text) {
    if (!text || !text.trim()) return "";
    const norm = normalize(text);
    const words = tokenizer.tokenize(norm).map(t => {
      const pron = [t.pronunciation, t.reading].find(x => x && x !== "*") || t.surface_form;
      return { surface: t.surface_form, hira: kata2hira(pron) };
    });
    const out = [];
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi], po = out[out.length - 1];
      const roma = wordToPhonemes(w.surface, w.hira);
      const tok = { s: roma, space: false };
      if ("「『«".includes(w.surface) || "([".includes(roma)) { if (po) po.space = true; }
      else if ("」』»".includes(w.surface) || "]).,?!:".includes(roma)) { if (po) po.space = false; tok.space = true; }
      else if (roma === " ") tok.space = false;
      else tok.space = true;
      out.push(tok);
    }
    let ps = out.map(t => t.s.replace(/っ/g, "") + (t.space ? " " : "")).join("");
    ps = ps.trim().replace(/\s+/g, " ").replace(/\(/g, "«").replace(/\)/g, "»");
    ps = ps.replace(/(?<![!",.:;?»—…”]) (?=ʔ)|(?<=ʔ) (?!["«“])/g, "");
    return ps;
  };
}

// Builds a tokenizer in the browser: kuromoji (ES module build) + the dictionary files from a CDN.
export async function create(kuromojiModule, dictBaseUrl) {
  const loader = {
    async loadArrayBuffer(url) {
      const res = await fetch(dictBaseUrl + url.replace(".gz", ""));
      if (!res.ok) throw new Error(`Couldn't download the Japanese dictionary (${res.status}).`);
      return res.arrayBuffer();
    }
  };
  const tokenizer = await new kuromojiModule.TokenizerBuilder({ loader }).build();
  return createFromTokenizer(tokenizer);
}
