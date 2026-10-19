/**
 * Japan's regional bowls as a collectible checklist. A bowl counts when a passport
 * visit matches it: the shop's own name says the style, or the shop is in that place
 * and serves that kind of bowl. Each links to its journal essay and a map search.
 */
import type { Shop } from "../data/shops.ts";
import { cuisineOf } from "../cuisines.ts";

export interface RegionalBowl {
  id: string;
  name: string;
  nameJa: string;
  where: string;
  /** Journal article slug. */
  journal: string;
  /** Map search words for /map/?q=… */
  search: string;
  matches(shop: Shop): boolean;
}

const inPlace = (shop: Shop, place: string) => {
  const text = `${shop.city} ${shop.localityRomanized ?? ""} ${shop.neighborhood}`.toLowerCase();
  return text.includes(place.toLowerCase());
};
const ramen = (shop: Shop) => cuisineOf(shop) === "ramen";
const styled = (shop: Shop, id: string) => !!shop.styles?.includes(id);
/** Okinawa's open data files soba shops as ramen (wheat noodles); the name says そば or すば. */
const okinawaSoba = (shop: Shop) => ramen(shop) && !shop.styles?.length
  && /そば|すば|\bsoba\b|\bsuba\b/i.test(`${shop.name} ${shop.nameRomanized ?? ""}`);

export const REGIONAL_BOWLS: readonly RegionalBowl[] = [
  { id: "asahikawa", name: "Asahikawa shoyu", nameJa: "旭川", where: "Hokkaido", journal: "asahikawa-shoyu", search: "asahikawa",
    matches: s => inPlace(s, "asahikawa") && ramen(s) },
  { id: "sapporo", name: "Sapporo miso", nameJa: "札幌", where: "Hokkaido", journal: "sapporo-miso-ramen", search: "sapporo",
    matches: s => styled(s, "sapporo") || (s.city === "Sapporo" && s.broth === "miso") },
  { id: "hakodate", name: "Hakodate shio", nameJa: "函館", where: "Hokkaido", journal: "hakodate-shio", search: "hakodate",
    matches: s => inPlace(s, "hakodate") && ramen(s) },
  { id: "kitakata", name: "Kitakata", nameJa: "喜多方", where: "Fukushima", journal: "kitakata-morning-ramen", search: "kitakata",
    matches: s => styled(s, "kitakata") || (s.city === "Kitakata" && ramen(s)) },
  { id: "tokyo", name: "Tokyo shoyu", nameJa: "東京", where: "Tokyo", journal: "tokyo-shoyu-chuka-soba", search: "chuka soba",
    matches: s => s.city === "Tokyo" && (s.broth === "shoyu" || styled(s, "chuka-soba")) },
  { id: "iekei", name: "Iekei", nameJa: "家系", where: "Yokohama", journal: "iekei-yokohama", search: "iekei",
    matches: s => styled(s, "iekei") },
  { id: "jiro", name: "Jiro-style", nameJa: "二郎", where: "Tokyo", journal: "ramen-jiro", search: "jiro",
    matches: s => styled(s, "jiro") },
  { id: "tsukemen", name: "Tsukemen", nameJa: "つけ麺", where: "Tokyo", journal: "tsukemen", search: "tsukemen",
    matches: s => s.broth === "tsukemen" || styled(s, "tsukemen") },
  { id: "toyama", name: "Toyama Black", nameJa: "富山", where: "Toyama", journal: "toyama-black", search: "toyama",
    matches: s => (s.prefecture === "Toyama" || inPlace(s, "toyama")) && ramen(s) },
  { id: "wakayama", name: "Wakayama", nameJa: "和歌山", where: "Wakayama", journal: "wakayama-ramen", search: "wakayama",
    matches: s => s.city === "Wakayama" && ramen(s) },
  { id: "onomichi", name: "Onomichi", nameJa: "尾道", where: "Hiroshima", journal: "onomichi-ramen", search: "onomichi",
    matches: s => inPlace(s, "onomichi") && ramen(s) },
  { id: "tokushima", name: "Tokushima", nameJa: "徳島", where: "Shikoku", journal: "tokushima-ramen", search: "tokushima",
    matches: s => inPlace(s, "tokushima") && ramen(s) },
  { id: "hakata", name: "Hakata tonkotsu", nameJa: "博多", where: "Fukuoka", journal: "hakata-tonkotsu", search: "hakata",
    matches: s => styled(s, "hakata") || (s.city === "Fukuoka" && s.broth === "tonkotsu") },
  { id: "kurume", name: "Kurume", nameJa: "久留米", where: "Fukuoka", journal: "hakata-tonkotsu", search: "kurume",
    matches: s => styled(s, "kurume") || (inPlace(s, "kurume") && ramen(s)) },
  { id: "kumamoto", name: "Kumamoto", nameJa: "熊本", where: "Kyushu", journal: "kumamoto-ramen", search: "kumamoto",
    matches: s => styled(s, "kumamoto") || (inPlace(s, "kumamoto") && ramen(s)) },
  { id: "champon", name: "Nagasaki champon", nameJa: "長崎", where: "Nagasaki", journal: "champon", search: "champon",
    matches: s => styled(s, "champon") },
  { id: "okinawa", name: "Okinawa soba", nameJa: "沖縄", where: "Okinawa", journal: "okinawa-soba", search: "okinawa soba",
    matches: s => styled(s, "okinawa-soba") || (s.prefecture === "Okinawa" && okinawaSoba(s)) },
];

/** Which regional bowls the visited shops have collected, with the shop that counted. */
export function collectedRegional(visited: readonly Shop[]): Map<string, Shop> {
  const collected = new Map<string, Shop>();
  for (const bowl of REGIONAL_BOWLS) {
    const shop = visited.find(s => bowl.matches(s));
    if (shop) collected.set(bowl.id, shop);
  }
  return collected;
}
