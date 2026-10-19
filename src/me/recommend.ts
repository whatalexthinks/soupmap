/**
 * "For you": suggestions built only from the visitor's own saves and visits plus the
 * catalog. No tracking, no profiles; everything is computed in the browser.
 */
import type { Shop } from "../data/shops.ts";
import { CITIES } from "../data/cities.ts";
import { isEditorial } from "../data/indexation.ts";
import { BROTH_IDS, type BrothId } from "../data/broths.ts";
import { distanceMeters } from "../discovery.ts";
import { REGIONAL_BOWLS } from "./regional.ts";
import { seeded } from "./planner.ts";

/** How much a shop is worth suggesting: editorial notes and known styles beat bare locations. */
export function interest(shop: Shop): number {
  return (isEditorial(shop) ? 5 : 0) + (shop.styles?.length ? 2 : 0) + (shop.broth !== "other" ? 1 : 0) + (shop.chain ? 0 : 1);
}

export interface NearbySuggestion { shop: Shop; anchor: Shop; meters: number }

/** Interesting shops a short walk from places the visitor saved or visited. */
export function nearYourPlaces(shops: readonly Shop[], anchors: readonly Shop[], exclude: ReadonlySet<string>,
  limit = 6, radius = 800): NearbySuggestion[] {
  const found = new Map<string, NearbySuggestion & { rank: number }>();
  const degLat = radius / 111_000;
  for (const anchor of anchors.slice(0, 12)) {
    const degLng = radius / (111_000 * Math.cos(anchor.lat * Math.PI / 180));
    const near = shops.filter(s => Math.abs(s.lat - anchor.lat) < degLat && Math.abs(s.lng - anchor.lng) < degLng
      && !exclude.has(s.slug) && s.slug !== anchor.slug);
    const ranked = near.map(shop => {
      const meters = Math.round(distanceMeters(anchor, shop));
      return { shop, anchor, meters, rank: interest(shop) - meters / 300 };
    }).filter(s => s.meters <= radius && interest(s.shop) >= 3).sort((a, b) => b.rank - a.rank).slice(0, 2);
    for (const s of ranked) if (!found.has(s.shop.slug) || found.get(s.shop.slug)!.rank < s.rank) found.set(s.shop.slug, s);
  }
  return [...found.values()].sort((a, b) => b.rank - a.rank).slice(0, limit).map(({ shop, anchor, meters }) => ({ shop, anchor, meters }));
}

/** The featured city the visitor cares about most (most saves and visits), Tokyo otherwise. */
export function focusCity(places: readonly Shop[]): string {
  const counts = new Map<string, number>();
  for (const shop of places) if (CITIES.some(c => c.name === shop.city)) counts.set(shop.city, (counts.get(shop.city) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Tokyo";
  return CITIES.find(c => c.name === top)!.slug;
}

export interface StyleGap { broth: BrothId; shops: Shop[] }

/** Broth styles not yet in the passport, each with a couple of places to try in the focus city. */
export function styleGaps(shops: readonly Shop[], visited: readonly Shop[], citySlug: string, limit = 3): StyleGap[] {
  const city = CITIES.find(c => c.slug === citySlug)?.name;
  const tried = new Set(visited.map(s => s.broth));
  const gaps: StyleGap[] = [];
  for (const id of BROTH_IDS) {
    if (id === "other" || tried.has(id)) continue;
    const options = shops.filter(s => s.broth === id && s.city === city && !s.chain)
      .sort((a, b) => interest(b) - interest(a) || a.slug.localeCompare(b.slug)).slice(0, 2);
    if (options.length) gaps.push({ broth: id, shops: options });
    if (gaps.length >= limit) break;
  }
  return gaps;
}

const BROTH_ARTICLES: Partial<Record<BrothId, string>> = {
  tonkotsu: "hakata-tonkotsu", miso: "sapporo-miso-ramen", shoyu: "tokyo-shoyu-chuka-soba", shio: "hakodate-shio",
  tsukemen: "tsukemen", udon: "sanuki-udon", soba: "soba-guide", oden: "oden", "chicken-paitan": "anatomy-of-a-bowl",
};
const STARTERS = ["regional-ramen-map", "four-ramen-flavours", "ticket-machine", "slurping-etiquette"];

/** Journal articles that match the visitor's places, most relevant first, padded with starters. */
export function readNext(places: readonly Shop[], available: ReadonlySet<string>, limit = 3): string[] {
  const votes = new Map<string, number>();
  const vote = (slug: string | undefined, weight: number) => { if (slug && available.has(slug)) votes.set(slug, (votes.get(slug) ?? 0) + weight); };
  for (const shop of places) {
    for (const bowl of REGIONAL_BOWLS) if (bowl.matches(shop)) vote(bowl.journal, 3);
    vote(BROTH_ARTICLES[shop.broth], 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([slug]) => slug);
  return [...new Set([...ranked, ...STARTERS.filter(s => available.has(s))])].slice(0, limit);
}

/** One place a day to read about and maybe add to a trip: editor's picks and well-described independents. */
export function bowlOfTheDay(shops: readonly Shop[], date: string): Shop | undefined {
  const choices = shops.filter(s => isEditorial(s) || (s.styles?.length && !s.chain && CITIES.some(c => c.name === s.city)));
  return choices.reduce<Shop | undefined>((best, s) =>
    !best || seeded(0, `${date}:${s.slug}`) < seeded(0, `${date}:${best.slug}`) ? s : best, undefined);
}
