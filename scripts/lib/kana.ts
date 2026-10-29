/**
 * Hiragana → Hepburn romaji for place names, without macrons ("Kyoto", not "Kyōto").
 *
 * Kana readings are unambiguous, unlike kanji: 久留米 is くるめ, so this gives
 * "Kurume" where a kanji reader guessed "Kuru Yone". Conventions:
 * - long vowels collapse once: おう/おお → o, うう → u (とうきょう → Tokyo); ei and ii stay
 *   (Seiyo, Niigata). A second vowel after a collapsed one is kept: とうおん → Toon.
 * - ん is always n, even before b, m and p (Sanmu), as in Japan's 2025 romanization rules.
 * - っ doubles the next consonant; before ch it becomes t (Hatcho).
 * Names that split across a morpheme boundary differently (Sanyo-Onoda) need an override.
 */

const BASE: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ゔ: "vu", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};

/** The consonant part of a -i syllable before a small ゃゅょ: き → ky, し → sh, ち → ch, じ → j. */
const YOON_STEM: Record<string, string> = {
  き: "ky", ぎ: "gy", し: "sh", じ: "j", ち: "ch", ぢ: "j", に: "ny", ひ: "hy", び: "by", ぴ: "py", み: "my", り: "ry",
};
const SMALL_Y: Record<string, string> = { ゃ: "a", ゅ: "u", ょ: "o" };

/** Convert one word of hiragana (katakana is folded to hiragana first). Throws on anything else. */
export function kanaToRomaji(input: string): string {
  const kana = input.normalize("NFC").replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  const syllables: string[] = [];
  for (let i = 0; i < kana.length; i++) {
    const ch = kana[i]!;
    const next = kana[i + 1];
    if (next && SMALL_Y[next] && YOON_STEM[ch]) {
      syllables.push(YOON_STEM[ch] + SMALL_Y[next]);
      i++;
    } else if (ch === "っ" || ch === "ー") {
      syllables.push(ch);
    } else if (BASE[ch] !== undefined) {
      syllables.push(BASE[ch]);
    } else {
      throw new Error(`Unexpected character "${ch}" in kana reading "${input}"`);
    }
  }
  let out = "";
  let collapsed = false;
  for (let i = 0; i < syllables.length; i++) {
    const s = syllables[i]!;
    if (s === "っ") {
      const following = syllables[i + 1];
      if (following) out += following.startsWith("ch") ? "t" : following[0];
      collapsed = false;
      continue;
    }
    if (s === "ー") { collapsed = true; continue; }
    const last = out.at(-1);
    // A bare vowel that lengthens the previous one: おう, おお, うう.
    if (!collapsed && s.length === 1 && last && ((last === "o" && (s === "u" || s === "o")) || (last === "u" && s === "u"))) {
      collapsed = true;
      continue;
    }
    out += s;
    collapsed = false;
  }
  return out;
}

/** "さっぽろ" → "Sapporo". */
export function placeName(kana: string): string {
  const romaji = kanaToRomaji(kana);
  return romaji.charAt(0).toUpperCase() + romaji.slice(1);
}
