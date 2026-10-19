import kuromoji from "kuromoji";
import { toRomaji } from "wanakana";
import { fileURLToPath } from "node:url";
import { hasJapanese } from "../../src/names.ts";

/**
 * Fixed readings for food and shop words, longest first. These are vocabulary, not
 * guesses at proper names; the dictionary often splits or misreads them (家系 → "kakei").
 */
const KNOWN_WORDS: ReadonlyArray<readonly [string, string]> = [
  ["横浜家系", "Yokohama Iekei"], ["自家製麺", "Jikasei Men"], ["中華そば", "Chuka Soba"], ["中華蕎麦", "Chuka Soba"],
  ["支那そば", "Shina Soba"], ["沖縄そば", "Okinawa Soba"], ["ソーキそば", "Soki Soba"], ["つけ麺", "Tsukemen"],
  ["つけめん", "Tsukemen"], ["まぜそば", "Mazesoba"], ["油そば", "Abura Soba"], ["担々麺", "Tantanmen"],
  ["担担麺", "Tantanmen"], ["タンタン麺", "Tantanmen"], ["鶏白湯", "Tori Paitan"], ["鶏そば", "Tori Soba"],
  ["専門店", "Senmonten"], ["総本店", "Sohonten"], ["製麺所", "Seimenjo"], ["ちゃんぽん", "Champon"],
  ["ラーメン", "Ramen"], ["とんこつ", "Tonkotsu"], ["手打ち", "Teuchi"], ["喜多方", "Kitakata"],
  ["にぼし", "Niboshi"], ["煮干し", "Niboshi"], ["うどん", "Udon"], ["饂飩", "Udon"], ["蕎麦", "Soba"],
  ["そば", "Soba"], ["おでん", "Oden"], ["家系", "Iekei"], ["手打", "Teuchi"], ["本店", "Honten"],
  ["製麺", "Seimen"], ["麺屋", "Menya"], ["麺や", "Menya"], ["麺処", "Mendokoro"], ["食堂", "Shokudo"],
  ["屋台", "Yatai"], ["豚骨", "Tonkotsu"], ["味噌", "Miso"], ["醤油", "Shoyu"], ["煮干", "Niboshi"],
  ["博多", "Hakata"], ["長浜", "Nagahama"], ["札幌", "Sapporo"], ["東京", "Tokyo"], ["大阪", "Osaka"],
  ["京都", "Kyoto"], ["讃岐", "Sanuki"], ["さぬき", "Sanuki"], ["二郎", "Jiro"], ["十割", "Juwari"],
];
const KNOWN = new Map(KNOWN_WORDS);
const KNOWN_PATTERN = new RegExp([...KNOWN.keys()].sort((a, b) => b.length - a.length).join("|"), "g");
/** Shop-name suffixes, written joined and read the shop way: Taishoken, Yamaokaya, Ippudo. */
const SUFFIXES: ReadonlyMap<string, string> = new Map([
  ["屋", "ya"], ["家", "ya"], ["亭", "tei"], ["軒", "ken"], ["庵", "an"], ["堂", "do"],
  ["舎", "sha"], ["坊", "bo"], ["苑", "en"], ["館", "kan"],
]);
/** Real particles inside names ("Maki no Udon"); は and へ are almost always misparsed name kana. */
const PARTICLES = new Set(["の", "ノ", "と"]);
/** Branch markers that are part of the name, not a location. */
const KEEP_TEN = /(?:本|専門|総本|直営|1号|一号)店$/;

function capitalize(word: string): string {
  return word ? word[0]!.toUpperCase() + word.slice(1) : word;
}

const KANA_ONLY = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;

/** Runs offline during catalog maintenance. No tokenizer or dictionary ships to browsers. */
export async function createRomanizer(): Promise<(value: string) => string | undefined> {
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve,reject) =>
    kuromoji.builder({dicPath:fileURLToPath(new URL("../../node_modules/kuromoji/dict/",import.meta.url))})
      .build((error,result)=>error ? reject(error) : resolve(result)));
  const cache = new Map<string,string | undefined>();

  const romanizeRun = (run: string): string[] => {
    const words: { text: string; kana: boolean; particle: boolean }[] = [];
    for (const token of tokenizer.tokenize(run)) {
      // The pronunciation marks true long vowels with ー (トーキョー, but イノウエ), so dropping
      // them gives Hepburn without macrons, as on Japanese road signs: Tokyo, Inoue, Omura.
      const misparsed = token.pos === "助詞" && !PARTICLES.has(token.surface_form);
      const spoken = [misparsed ? token.surface_form : token.pronunciation, token.reading, token.surface_form]
        .find(v => v && v !== "*")!;
      const text = toRomaji(spoken.replace(/ー/g, "")).toLowerCase();
      const kana = KANA_ONLY.test(token.surface_form);
      const particle = token.pos === "助詞" && PARTICLES.has(token.surface_form);
      const previous = words.at(-1);
      const suffix = SUFFIXES.get(token.surface_form);
      if (previous && suffix) previous.text += suffix;
      // Kana fragments of one name ("はな"+"まる") belong together; particles stay apart.
      else if (previous && kana && previous.kana && !particle && !previous.particle) previous.text += text;
      else words.push({ text, kana, particle });
    }
    // Kana-written names carry no pronunciation marks; treat ou/uu/oo as long vowels: まんのう → Manno.
    const vowels = (w: { text: string; kana: boolean }) => w.kana ? w.text.replace(/ou/g, "o").replace(/uu/g, "u").replace(/oo/g, "o") : w.text;
    return words.map(word => word.particle ? word.text : capitalize(vowels(word)));
  };

  return value => {
    if (!value || !hasJapanese(value)) return undefined;
    if (cache.has(value)) return cache.get(value);
    let normalized = value.normalize("NFKC")
      .replace(/らーめん|らあめん|らぁめん|らうめん|拉麺|ラーメン/g, "ラーメン")
      .replace(/担[々担]麺/g, "担々麺").replace(/沖繩/g, "沖縄").replace(/麵/g, "麺").trim();
    // "Brand 松山店" → "Brand Matsuyama": a trailing branch 店 is not part of the name.
    if (normalized.endsWith("店") && !KEEP_TEN.test(normalized)) normalized = normalized.slice(0, -1);
    const words: string[] = [];
    let last = 0;
    const flush = (segment: string) => {
      for (const run of segment.split(/([\s\p{P}\p{S}]+)/u)) {
        if (!run) continue;
        if (/^[\s\p{P}\p{S}]+$/u.test(run)) { if (/[-&×・/]/.test(run)) words.push(run.trim() === "・" ? "" : run.trim()); continue; }
        words.push(...(hasJapanese(run) ? romanizeRun(run) : [run]));
      }
    };
    for (const match of normalized.matchAll(KNOWN_PATTERN)) {
      flush(normalized.slice(last, match.index));
      words.push(KNOWN.get(match[0])!);
      last = match.index + match[0].length;
    }
    flush(normalized.slice(last));
    const reading = words.filter(Boolean).join(" ").replace(/ × /g, " × ").replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").trim();
    // Unknown proper names must stay in Japanese, not be invented.
    const result = reading && !hasJapanese(reading) ? reading : undefined;
    cache.set(value, result);
    return result;
  };
}

/** Japanese municipality → English place name: 大阪市中央区 → "Chuo, Osaka"; 宮古島市 → "Miyakojima". */
export function localityNamer(romanize: (value: string) => string | undefined): (locality: string) => string | undefined {
  const strip = (part: string) => part.replace(/[市区町村]$/, "");
  return locality => {
    const value = locality.normalize("NFKC").replace(/^.+?郡/, "").trim();
    if (!value || !hasJapanese(value)) return value || undefined;
    const ward = value.match(/^(.+?)市(.+?)区$/);
    const parts = ward ? [ward[2]!, ward[1]!] : [strip(value)];
    const names = parts.map(part => romanize(part));
    return names.every(Boolean) ? names.join(", ") : undefined;
  };
}
