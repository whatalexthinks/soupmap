/**
 * English names that noodle chains use for themselves (signage, websites), for chains
 * common in the catalog. Only names we are confident in; everything else falls back to
 * the generated reading. Patterns match the NFKC-normalised Japanese name.
 */
export const BRANDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/はなまるうどん/, "Hanamaru Udon"],
  [/丸亀製麺/, "Marugame Seimen"],
  [/丸源ラーメン/, "Marugen Ramen"],
  [/山岡家/, "Ramen Yamaokaya"],
  [/山田うどん/, "Yamada Udon"],
  [/くるまやラーメン/, "Kurumaya Ramen"],
  [/8番らーめん|8番ラーメン/, "Hachiban Ramen"],
  [/リンガーハット/, "Ringer Hut"],
  [/味千ラーメン/, "Ajisen Ramen"],
  [/魁力屋/, "Kairikiya"],
  [/資さんうどん/, "Sukesan Udon"],
  [/幸楽苑/, "Kourakuen"],
  [/一蘭/, "Ichiran"],
  [/一風堂/, "Ippudo"],
  [/天下一品/, "Tenkaippin"],
  [/日高屋/, "Hidakaya"],
  [/スガキヤ|寿がきや/, "Sugakiya"],
  [/来来亭/, "Rairaitei"],
  [/神座/, "Kamukura"],
  [/喜多方ラーメン\s*坂内/, "Kitakata Ramen Bannai"],
  [/町田商店/, "Machida Shoten"],
  [/蒙古タンメン中本/, "Moko Tanmen Nakamoto"],
  [/AFURI|阿夫利/i, "AFURI"],
  [/六厘舎/, "Rokurinsha"],
  [/つじ田/, "Tsujita"],
  [/桂花ラーメン/, "Keika Ramen"],
  [/山頭火/, "Ramen Santouka"],
  [/小諸そば/, "Komoro Soba"],
  [/富士そば/, "Fuji Soba"],
  [/ゆで太郎/, "Yudetaro"],
  [/箱根そば/, "Hakone Soba"],
  [/スープストック|soup stock tokyo/i, "Soup Stock Tokyo"],
  [/一幸舎/, "Hakata Ikkousha"],
  [/揚州商人/, "Yoshu Shonin"],
  [/天理スタミナラーメン/, "Tenri Stamina Ramen"],
  [/河童ラーメン本舗/, "Kappa Ramen Honpo"],
  [/大砲ラーメン/, "Taiho Ramen"],
  [/ラーメン豚山|^豚山/, "Ramen Butayama"],
  [/中華そば\s*青葉/, "Chuka Soba Aoba"],
  [/牧のうどん/, "Maki no Udon"],
  [/おおぎやラーメン/, "Ogiya Ramen"],
  [/藤一番/, "Fujiichiban"],
  [/杵屋/, "Kineya"],
  [/つるとんたん/, "Tsurutontan"],
  [/大勝軒/, "Taishoken"],
  [/麺屋武蔵|麺屋 武蔵/, "Menya Musashi"],
  [/ずんどう屋/, "Zundoya"],
  [/壱角家/, "Ichikakuya"],
  [/魂心家/, "Konshinya"],
  [/ラーメン横綱/, "Ramen Yokozuna"],
];

/** Splits "<brand><branch>" into the brand's English name and the leftover branch text. */
export function matchBrand(name: string): { english: string; rest: string } | undefined {
  const text = name.normalize("NFKC");
  for (const [pattern, english] of BRANDS) {
    const match = text.match(pattern);
    if (match?.index === undefined) continue;
    const rest = (text.slice(0, match.index) + " " + text.slice(match.index + match[0].length))
      .replace(/^[\s×xX&・/-]+|[\s×xX&・/-]+$/g, "").trim();
    return { english, rest };
  }
  return undefined;
}
