/**
 * "Don't feel like cooking?": a handful of catalog places for a recipe's style, and the
 * city guides that list the rest. Built at prerender time from the same guides as
 * /guides/, so every place shown is one a guide also lists.
 */
import type { Shop } from "../data/schema.ts";
import type { Guide, GuideStyle } from "../guides/model.ts";
import { stylesForRecipe } from "./catalog-links.ts";

export interface RecipePlaces {
  /** The style the places were chosen for (the recipe's most specific style with guides). */
  style: GuideStyle;
  /** The guide each place was taken from, so the card can say where it is and why. */
  picks: { shop: Shop; guide: Guide }[];
  /** The biggest guides for the recipe's styles, home cities first. */
  guides: Guide[];
}

export const PLACES_SHOWN = 6;
const PER_CITY = 2;

/** Home cities first, then the longest lists; guides below the index threshold are skipped. */
function rankGuides(guides: readonly Guide[], eligible: (guide: Guide) => boolean): Guide[] {
  return guides.filter(eligible).sort((a, b) => Number(b.home) - Number(a.home) || b.shops.length - a.shops.length || a.path.localeCompare(b.path));
}

export function placesForRecipe(slug: string, guides: readonly Guide[], eligible: (guide: Guide) => boolean): RecipePlaces | undefined {
  const styles = stylesForRecipe(slug);
  if (!styles.length) return undefined;
  const ranked = styles.flatMap(style => rankGuides(guides.filter(g => g.style.id === style.id), eligible));
  if (!ranked.length) return undefined;
  const picks: RecipePlaces["picks"] = [];
  const chosen = new Set<string>();
  const perCity = new Map<string, number>();
  // Round-robin through the ranked guides: one place from each, then a second pass.
  for (let round = 0; round < PER_CITY && picks.length < PLACES_SHOWN; round++) {
    for (const guide of ranked) {
      if (picks.length >= PLACES_SHOWN) break;
      const city = guide.place.municipality.code;
      if ((perCity.get(city) ?? 0) >= PER_CITY) continue;
      const shop = guide.shops.find(s => !chosen.has(s.slug) && !s.chain);
      if (!shop) continue;
      picks.push({ shop, guide });
      chosen.add(shop.slug);
      perCity.set(city, (perCity.get(city) ?? 0) + 1);
    }
  }
  if (!picks.length) return undefined;
  const style = ranked[0]!.style;
  return { style, picks, guides: ranked.slice(0, 6) };
}
