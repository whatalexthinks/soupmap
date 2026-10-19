/**
 * Named bowl styles that a shop's own name can reveal ("味噌ラーメン", "家系", "讃岐うどん").
 *
 * These are evidence from the name, not a verified menu: the catalog stores them with
 * `brothSource: "name"` and the interface says "suggested by the shop's name".
 * Patterns are deliberately narrow; place names such as 塩釜 or 塩尻 must not match "shio".
 * Descriptions are our own short summaries of general background.
 */
import type { BrothId } from "./broths.ts";

export interface StyleTag {
  id: string;
  label: string;
  labelJa: string;
  /** Matched against the Japanese/primary name after NFKC normalisation. */
  pattern: RegExp;
  /** Broth the name strongly implies, if any. */
  broth?: BrothId;
  cuisine?: "ramen" | "udon" | "soba" | "oden";
  description: string;
}

export const STYLE_TAGS: readonly StyleTag[] = [
  { id: "iekei", label: "Iekei", labelJa: "家系", pattern: /家系/, broth: "tonkotsu", cuisine: "ramen",
    description: "Yokohama-born pork-and-soy bowl with thick noodles, spinach and nori." },
  { id: "jiro", label: "Jiro-style", labelJa: "二郎系", pattern: /二郎|ラーメン豚山|豚山/, cuisine: "ramen",
    description: "Towering bean sprouts, garlic and back fat over thick, chewy noodles." },
  { id: "hakata", label: "Hakata / Nagahama", labelJa: "博多・長浜", pattern: /博多|長浜ラーメン|長浜らーめん/, broth: "tonkotsu", cuisine: "ramen",
    description: "Milky pork-bone broth with thin, straight noodles and noodle refills." },
  { id: "kurume", label: "Kurume", labelJa: "久留米", pattern: /久留米ラーメン|久留米らーめん/, broth: "tonkotsu", cuisine: "ramen",
    description: "The Fukuoka-prefecture city often cited as tonkotsu ramen's birthplace." },
  { id: "kumamoto", label: "Kumamoto", labelJa: "熊本", pattern: /熊本ラーメン|熊本らーめん/, broth: "tonkotsu", cuisine: "ramen",
    description: "Pork-and-chicken broth finished with garlic chips and black garlic oil." },
  { id: "sapporo", label: "Sapporo", labelJa: "札幌", pattern: /札幌ラーメン|札幌らーめん|札幌味噌|さっぽろ/, broth: "miso", cuisine: "ramen",
    description: "Hokkaido's wok-fried miso bowl with curly yellow noodles." },
  { id: "kitakata", label: "Kitakata", labelJa: "喜多方", pattern: /喜多方/, broth: "shoyu", cuisine: "ramen",
    description: "Clear soy broth and flat, wavy noodles from Fukushima's morning-ramen town." },
  { id: "tsukemen", label: "Tsukemen", labelJa: "つけ麺", pattern: /つけ麺|つけめん|ツケメン|沾麺|つけそば/, broth: "tsukemen", cuisine: "ramen",
    description: "Noodles served on the side and dipped into a concentrated broth." },
  { id: "tonkotsu", label: "Tonkotsu", labelJa: "豚骨", pattern: /豚骨|とんこつ|トンコツ/, broth: "tonkotsu", cuisine: "ramen",
    description: "Pork bones boiled hard until the broth turns milky." },
  { id: "miso", label: "Miso", labelJa: "味噌", pattern: /味噌|みそ(?:ラーメン|らーめん|拉麺)|ミソラーメン/, broth: "miso", cuisine: "ramen",
    description: "Seasoned with fermented soybean paste." },
  { id: "shoyu", label: "Shoyu", labelJa: "醤油", pattern: /醤油|しょうゆ|しょう油|正油/, broth: "shoyu", cuisine: "ramen",
    description: "Seasoned with soy sauce: the classic clear brown bowl." },
  { id: "shio", label: "Shio", labelJa: "塩", pattern: /塩(?:ラーメン|らーめん|拉麺|そば|中華|つけ)|しお(?:ラーメン|らーめん|そば)/, broth: "shio", cuisine: "ramen",
    description: "Seasoned with salt; usually clear and delicate." },
  { id: "tori-paitan", label: "Tori paitan", labelJa: "鶏白湯", pattern: /鶏白湯|鶏パイタン|とりぱいたん/, broth: "chicken-paitan", cuisine: "ramen",
    description: "Chicken simmered until the broth goes creamy and opaque." },
  { id: "niboshi", label: "Niboshi", labelJa: "煮干し", pattern: /煮干|にぼし|ニボシ/, cuisine: "ramen",
    description: "Built on dried sardines: savoury, slightly bitter, deeply fishy." },
  { id: "chuka-soba", label: "Chuka soba", labelJa: "中華そば", pattern: /中華そば|中華蕎麦|支那そば|しなそば/, cuisine: "ramen",
    description: "The old-fashioned name for ramen, usually a clear soy bowl." },
  { id: "tantanmen", label: "Tantanmen", labelJa: "担々麺", pattern: /担[々担]麺|坦[々坦]麺|タンタン麺|たんたん麺/, cuisine: "ramen",
    description: "Sesame and chilli-oil noodles adapted from Sichuan dandan noodles." },
  { id: "mazesoba", label: "Mazesoba / abura soba", labelJa: "まぜそば", pattern: /まぜそば|混ぜそば|油そば|あぶらそば|汁なし/, cuisine: "ramen",
    description: "Brothless noodles tossed with a sauce at the bottom of the bowl." },
  { id: "champon", label: "Champon", labelJa: "ちゃんぽん", pattern: /ちゃんぽん|チャンポン/, cuisine: "ramen",
    description: "Nagasaki's pork, seafood and vegetable noodle soup." },
  { id: "okinawa-soba", label: "Okinawa soba", labelJa: "沖縄そば", pattern: /沖縄そば|ソーキそば|八重山そば|宮古そば|沖縄すば/,
    description: "Okinawa's wheat noodles in a pork-and-bonito broth." },
  { id: "sanuki", label: "Sanuki udon", labelJa: "讃岐うどん", pattern: /讃岐|さぬき/, broth: "udon", cuisine: "udon",
    description: "Kagawa's firm, springy udon, often self-service." },
  { id: "kishimen", label: "Kishimen", labelJa: "きしめん", pattern: /きしめん|棊子麺/, broth: "udon", cuisine: "udon",
    description: "Nagoya's wide, flat wheat noodles." },
  { id: "hoto", label: "Hōtō", labelJa: "ほうとう", pattern: /ほうとう/, broth: "udon", cuisine: "udon",
    description: "Yamanashi's flat noodles stewed in miso with pumpkin." },
  { id: "juwari", label: "Juwari soba", labelJa: "十割そば", pattern: /十割/, broth: "soba", cuisine: "soba",
    description: "Soba made from 100% buckwheat flour." },
];

export const STYLE_BY_ID: ReadonlyMap<string, StyleTag> = new Map(STYLE_TAGS.map(s => [s.id, s]));

const UDON_OR_SOBA = /うどん|饂飩|蕎麦|(?<!中華|支那|しな|まぜ|混ぜ|油|あぶら|沖縄|ソーキ|八重山|宮古)そば/;

/**
 * Style tags a shop's name supports, most specific first (regional styles before broths).
 * An udon or soba shop never gets ramen tags: 博多うどん is soft udon, not tonkotsu.
 */
export function inferStyles(name: string): StyleTag[] {
  const text = name.normalize("NFKC");
  const noodleShop = UDON_OR_SOBA.test(text);
  return STYLE_TAGS.filter(style => style.pattern.test(text) && !(noodleShop && style.cuisine === "ramen"));
}

/** The broth implied by the most specific matching tag, if any. */
export function brothFromStyles(styles: readonly StyleTag[]): BrothId | undefined {
  return styles.find(style => style.broth)?.broth;
}
