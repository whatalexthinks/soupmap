/**
 * The soup styles that get city guides, and how a shop is matched to one.
 * Kept free of the municipality data so the browser can use it (shop profiles link
 * to a recipe through these styles).
 */
import { CUISINES, cuisineOf } from "../cuisines.ts";
import { BROTHS } from "../data/broths.ts";
import type { Shop } from "../data/schema.ts";
import { STYLE_BY_ID } from "../data/styles.ts";

export type GuideCuisine = "ramen" | "udon" | "soba" | "oden";

export interface GuideStyle {
  /** URL slug: "miso-ramen", "sanuki-udon", "ramen". */
  id: string;
  label: string;
  labelJa: string;
  cuisine: GuideCuisine;
  /** How shops are matched, which decides how the guide words its claims. */
  matchedBy: "cuisine" | "broth" | "name";
  /** STYLE_TAGS id for broth and name styles. */
  tag?: string;
  about: string;
  /** Where the style comes from: a municipality (by Japanese name) or a prefecture. */
  home?: { prefecture: number; nameJa?: string; note: string };
}

const CUISINE_ABOUT: Record<GuideCuisine, string> = {
  ramen: "Wheat noodles in a seasoned broth with toppings such as chashu pork, egg and spring onion. Japan's most common noodle-shop bowl, and one that changes from city to city.",
  udon: "Thick wheat noodles, soft or springy depending on the region, served in a light dashi-and-soy broth or chilled with a dipping sauce.",
  soba: "Buckwheat noodles served hot in dashi broth or cold with a dipping sauce. Soba shops often serve tempura and simple rice dishes too.",
  oden: "A slow winter pot of daikon, eggs, konnyaku and fish cakes simmered in a light dashi broth, often served at counters and izakaya.",
};

const CUISINE_JA: Record<GuideCuisine, string> = { ramen: "ラーメン", udon: "うどん", soba: "そば", oden: "おでん" };

/** Style tags that get guides, with readable slugs. Broth styles match on the shop's broth. */
const TAG_STYLES: readonly { tag: string; id: string; label?: string; by: "broth" | "name"; home?: GuideStyle["home"] }[] = [
  { tag: "tonkotsu", id: "tonkotsu-ramen", label: "Tonkotsu ramen", by: "broth" },
  { tag: "shoyu", id: "shoyu-ramen", label: "Shoyu ramen", by: "broth" },
  { tag: "miso", id: "miso-ramen", label: "Miso ramen", by: "broth" },
  { tag: "shio", id: "shio-ramen", label: "Shio ramen", by: "broth" },
  { tag: "tori-paitan", id: "tori-paitan-ramen", label: "Tori paitan ramen", by: "broth" },
  { tag: "tsukemen", id: "tsukemen", by: "broth" },
  { tag: "iekei", id: "iekei-ramen", label: "Iekei ramen", by: "name",
    home: { prefecture: 14, nameJa: "横浜市", note: "Iekei began in Yokohama, where Yoshimuraya opened in 1974." } },
  { tag: "jiro", id: "jiro-ramen", label: "Jiro-style ramen", by: "name" },
  { tag: "hakata", id: "hakata-ramen", label: "Hakata ramen", by: "name",
    home: { prefecture: 40, nameJa: "福岡市", note: "Hakata ramen is Fukuoka's own style; Hakata is the city's old merchant quarter." } },
  { tag: "kurume", id: "kurume-ramen", label: "Kurume ramen", by: "name",
    home: { prefecture: 40, nameJa: "久留米市", note: "Kurume is often cited as the birthplace of tonkotsu ramen." } },
  { tag: "kumamoto", id: "kumamoto-ramen", label: "Kumamoto ramen", by: "name",
    home: { prefecture: 43, nameJa: "熊本市", note: "This is the city Kumamoto ramen is named after." } },
  { tag: "sapporo", id: "sapporo-ramen", label: "Sapporo ramen", by: "name",
    home: { prefecture: 1, nameJa: "札幌市", note: "Sapporo is the city that made miso ramen famous." } },
  { tag: "kitakata", id: "kitakata-ramen", label: "Kitakata ramen", by: "name",
    home: { prefecture: 7, nameJa: "喜多方市", note: "Kitakata is the Fukushima town this style is named after, known for ramen at breakfast." } },
  { tag: "niboshi", id: "niboshi-ramen", label: "Niboshi ramen", by: "name" },
  { tag: "chuka-soba", id: "chuka-soba", by: "name" },
  { tag: "tantanmen", id: "tantanmen", by: "name" },
  { tag: "mazesoba", id: "mazesoba", label: "Mazesoba", by: "name" },
  { tag: "champon", id: "champon", by: "name",
    home: { prefecture: 42, nameJa: "長崎市", note: "Champon comes from Nagasaki." } },
  { tag: "okinawa-soba", id: "okinawa-soba", by: "name",
    home: { prefecture: 47, note: "Okinawa soba is the islands' own noodle." } },
  { tag: "sanuki", id: "sanuki-udon", by: "name",
    home: { prefecture: 37, note: "Sanuki is the old name for Kagawa, the prefecture this udon comes from." } },
  { tag: "kishimen", id: "kishimen", by: "name",
    home: { prefecture: 23, nameJa: "名古屋市", note: "Kishimen is Nagoya's own noodle." } },
  { tag: "hoto", id: "hoto", label: "Hōtō", by: "name",
    home: { prefecture: 19, note: "Hōtō is Yamanashi's regional dish." } },
  { tag: "juwari", id: "juwari-soba", by: "name" },
];

export const GUIDE_STYLES: readonly GuideStyle[] = [
  ...(["ramen", "udon", "soba", "oden"] as const).map(cuisine => ({
    id: cuisine, label: CUISINES.find(c => c.id === cuisine)!.label, labelJa: CUISINE_JA[cuisine], cuisine,
    matchedBy: "cuisine" as const, about: CUISINE_ABOUT[cuisine],
  })),
  ...TAG_STYLES.map(({ tag, id, label, by, home }) => {
    const style = STYLE_BY_ID.get(tag);
    if (!style?.cuisine && tag !== "okinawa-soba") throw new Error(`Guide style ${tag} has no cuisine`);
    return {
      id, label: label ?? style!.label, labelJa: style!.labelJa,
      // Okinawa soba is wheat noodles in pork broth: listed with ramen-style bowls, never buckwheat.
      cuisine: (style!.cuisine ?? "ramen") as GuideCuisine, matchedBy: by, tag, about: style!.description, ...(home ? { home } : {}),
    };
  }),
];
export const guideStyleById: ReadonlyMap<string, GuideStyle> = new Map(GUIDE_STYLES.map(s => [s.id, s]));

export function matchesStyle(shop: Shop, style: GuideStyle): boolean {
  const cuisine = cuisineOf(shop);
  if (style.matchedBy === "cuisine") return cuisine === style.cuisine;
  if (style.matchedBy === "broth") {
    const broth = STYLE_BY_ID.get(style.tag!)!.broth;
    return cuisine === "ramen" && shop.broth === broth;
  }
  return !!shop.styles?.includes(style.tag!);
}

/** "places whose names point to miso ramen": what the list actually shows. */
export function matchPhrase(style: GuideStyle, count: number): string {
  const places = count === 1 ? "place" : "places";
  if (style.matchedBy === "cuisine") return `${style.label.toLowerCase()} ${places}`;
  if (style.matchedBy === "broth") return `${places} whose names (or our notes) point to ${BROTHS[STYLE_BY_ID.get(style.tag!)!.broth!].label.toLowerCase()} broth`;
  return `${places} whose names point to ${style.label}`;
}
