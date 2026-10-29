/**
 * Which pages get their own share card, and what it says. Paths are fixed so pages can
 * point at their card before the build renders it (vite.config.ts emits the PNGs).
 */
import type { Recipe } from "../recipes/content.ts";
import { facetLabel } from "../recipes/facets.ts";
import { formatMinutes } from "../recipes/quantity.ts";
import type { Guide, GuideStyle } from "../guides/model.ts";
import type { GuideIntro } from "../guides/intros.ts";
import { recipeForStyle } from "../recipes/catalog-links.ts";
import type { CardText } from "./cards.ts";

export const recipeCardPath = (slug: string) => `/social/recipes/${slug}.png`;
export const guideCardPath = (slug: string) => `/social/guides/${slug}.png`;
export const styleCardPath = (id: string) => `/social/guides/style-${id}.png`;

const plural = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

export function recipeCard(recipe: Recipe, host: string): CardText {
  return {
    kicker: `Recipe · ${recipe.country} · ${facetLabel("type", recipe.type)}`,
    title: recipe.title, lede: recipe.dek, mark: recipe.mark, site: `${host}/recipes`,
    footer: `Prep ${formatMinutes(recipe.prep)} · ${recipe.cook ? `Cook ${formatMinutes(recipe.cook)}` : "No cooking"} · Serves ${recipe.serves}`,
  };
}

export function guideCard(guide: Guide, intro: GuideIntro | undefined, host: string): CardText {
  return {
    kicker: `City guide · ${guide.place.prefecture.name}`,
    title: `${guide.style.label} in ${guide.place.municipality.name}`,
    ...(intro ? { lede: intro.dek } : {}),
    footer: `${plural(guide.shops.length, "place")} · ${guide.independents.toLocaleString("en-US")} independent · map and sources${recipeForStyle(guide.style.id) ? " · a recipe" : ""}`,
    mark: guide.style.labelJa, markCaption: guide.place.municipality.nameJa, site: `${host}/guides`,
  };
}

export function styleCard(style: GuideStyle, guides: readonly Guide[], host: string): CardText {
  const places = guides.reduce((sum, g) => sum + g.shops.length, 0);
  return {
    kicker: "City guides · Japan", title: `${style.label} across Japan`, lede: style.about,
    footer: `${plural(places, "place")} in ${plural(guides.length, "city").replace(/citys$/, "cities")}`,
    mark: style.labelJa, site: `${host}/guides`,
  };
}
