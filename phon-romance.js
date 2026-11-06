// Turns text into Kokoro "pronunciation symbols" for Spanish, French, Italian, Portuguese and Hindi.
// Uses eSpeak NG (via the ephone library) and then translates its symbols the way Kokoro's own
// converter (misaki) does.

export const KOKORO_VOCAB = new Set(";:,.!?—…\"()“” ̃ʣʥʦʨᵝꭧAIOQSTWYᵊabcdefhijklmnopqrstuvwxyzɑɐɒæβɔɕçɖðʤəɚɛɜɟɡɥɨɪʝɯɰŋɳɲɴøɸθœɹɾɻʁɽʂʃʈʧʊʋʌɣɤχʎʒʔˈˌːʰʲ↓→↗↘ᵻ");

const SETUP = {
  es: { pack: "roa", voice: "es" },
  fr: { pack: "roa", voice: "fr" },
  it: { pack: "roa", voice: "it" },
  pt: { pack: "roa", voice: "pt-BR" },
  hi: { pack: "all", voice: "hi" }
};

// eSpeak writes diphthongs and affricates as two symbols; Kokoro has one symbol for each.
const PAIRS = [["aɪ", "I"], ["aʊ", "W"], ["eɪ", "A"], ["oʊ", "O"], ["əʊ", "Q"], ["ɔɪ", "Y"],
               ["dʒ", "ʤ"], ["tʃ", "ʧ"], ["dz", "ʣ"], ["ts", "ʦ"]];
// Symbols eSpeak can produce that Kokoro doesn't have, replaced by the closest one it does.
const SUBS = { g: "ɡ", "ɫ": "l", "ɭ": "l", "ɦ": "h", "ɱ": "m", "ʐ": "ʒ", "ɠ": "ɡ", "ǝ": "ə" };

export function espeakToKokoro(ps) {
  ps = ps.replace(/\^/g, "").replace(/-/g, "").replace(/\r?\n/g, " ");
  for (const [a, b] of PAIRS) ps = ps.split(a).join(b);
  let out = "";
  for (const ch of ps) {
    const c = SUBS[ch] ?? ch;
    if (KOKORO_VOCAB.has(c)) out += c;
  }
  return out.replace(/ +/g, " ").trim();
}

// ephoneModule: the loaded ephone library
export async function create(lang, ephoneModule) {
  const s = SETUP[lang];
  if (!s) throw new Error("Unsupported language: " + lang);
  const ephone = await ephoneModule.default(ephoneModule[s.pack]);
  ephone.setVoice(s.voice);
  return async text => espeakToKokoro(ephone.textToIpa(text));
}
