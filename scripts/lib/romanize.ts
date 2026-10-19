import kuromoji from "kuromoji";
import { toRomaji } from "wanakana";
import { fileURLToPath } from "node:url";
import { hasJapanese } from "../../src/names.ts";

/** Runs offline during catalog maintenance. No tokenizer or dictionary ships to browsers. */
export async function createRomanizer(): Promise<(value: string) => string | undefined> {
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve,reject) =>
    kuromoji.builder({dicPath:fileURLToPath(new URL("../../node_modules/kuromoji/dict/",import.meta.url))})
      .build((error,result)=>error ? reject(error) : resolve(result)));
  const cache = new Map<string,string | undefined>();
  return value => {
    if (!value || !hasJapanese(value)) return undefined;
    if (cache.has(value)) return cache.get(value);
    // Common food words absent from the dictionary, not guesses at proper names.
    const normalized = value.normalize("NFKC")
      .replace(/担[々担]麺/g,"タンタンメン").replace(/拉麺/g,"ラーメン")
      .replace(/製麺/g,"セイメン").replace(/沖繩/g,"オキナワ").replace(/麵/g,"メン");
    const reading = tokenizer.tokenize(normalized).map(token =>
      toRomaji(token.reading && token.reading !== "*" ? token.reading : token.surface_form)).join(" ")
      .replace(/\s+/g," ").replace(/\s+([,.)])/g,"$1").trim()
      .replace(/\b[a-z]/g,letter=>letter.toUpperCase());
    // Unknown proper names must stay in Japanese, not be invented.
    const result = reading && !hasJapanese(reading) ? reading : undefined;
    cache.set(value,result);
    return result;
  };
}
