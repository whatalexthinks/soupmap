/**
 * The bridge between recipes and the catalog: which guide styles a recipe cooks, and
 * which recipe a shop's style points to ("Make miso ramen at home").
 *
 * A hand-kept table rather than recipe content, so shop profiles in the browser can link
 * to a recipe without loading the recipes. tests/seo-graph.test.ts checks every slug,
 * title and style against the real recipes and guide styles.
 */
import type { Shop } from "../data/schema.ts";
import { guideStyleById, matchesStyle, type GuideStyle } from "../guides/styles.ts";

export interface RecipeLink {
  recipe: string;
  title: string;
  mark: string;
  /** Guide style ids this recipe cooks, most specific first. */
  styles: readonly string[];
}

export const RECIPE_LINKS: readonly RecipeLink[] = [
  { recipe: "tonkotsu-ramen", title: "Tonkotsu ramen", mark: "豚骨ラーメン", styles: ["hakata-ramen", "kurume-ramen", "kumamoto-ramen", "tonkotsu-ramen"] },
  { recipe: "miso-ramen", title: "Miso ramen", mark: "味噌ラーメン", styles: ["sapporo-ramen", "miso-ramen"] },
  { recipe: "shoyu-ramen", title: "Shoyu ramen", mark: "醤油ラーメン", styles: ["kitakata-ramen", "chuka-soba", "shoyu-ramen"] },
  { recipe: "shio-ramen", title: "Shio ramen", mark: "塩ラーメン", styles: ["shio-ramen"] },
  { recipe: "tsukemen", title: "Tsukemen (dipping ramen)", mark: "つけ麺", styles: ["tsukemen"] },
  { recipe: "tantanmen", title: "Tantanmen (sesame and chilli ramen)", mark: "担々麺", styles: ["tantanmen"] },
  { recipe: "chicken-paitan-ramen", title: "Chicken paitan ramen (tori paitan)", mark: "鶏白湯ラーメン", styles: ["tori-paitan-ramen"] },
  { recipe: "hoto", title: "Hōtō (Yamanashi miso noodle stew)", mark: "ほうとう", styles: ["hoto"] },
  { recipe: "kitsune-udon", title: "Kitsune udon", mark: "きつねうどん", styles: ["udon"] },
  { recipe: "curry-udon", title: "Curry udon", mark: "カレーうどん", styles: ["udon"] },
  { recipe: "kake-soba", title: "Kake soba", mark: "かけそば", styles: ["soba"] },
  { recipe: "oden", title: "Oden", mark: "おでん", styles: ["oden"] },
];

export const recipeLinkBySlug: ReadonlyMap<string, RecipeLink> = new Map(RECIPE_LINKS.map(link => [link.recipe, link]));

/** The guide styles a recipe cooks, most specific first (empty for non-Japanese soups). */
export function stylesForRecipe(slug: string): GuideStyle[] {
  return (recipeLinkBySlug.get(slug)?.styles ?? []).map(id => guideStyleById.get(id)!);
}

/**
 * Specific styles beat broths, and broths beat plain cuisines, so a 博多 shop gets the
 * tonkotsu recipe rather than "ramen". Udon goes to kitsune udon unless the name says curry.
 */
const PRIORITY: readonly [string, string][] = [
  ["hakata-ramen", "tonkotsu-ramen"], ["kurume-ramen", "tonkotsu-ramen"], ["kumamoto-ramen", "tonkotsu-ramen"],
  ["sapporo-ramen", "miso-ramen"], ["kitakata-ramen", "shoyu-ramen"], ["tsukemen", "tsukemen"],
  ["tantanmen", "tantanmen"], ["tori-paitan-ramen", "chicken-paitan-ramen"], ["hoto", "hoto"],
  ["tonkotsu-ramen", "tonkotsu-ramen"], ["miso-ramen", "miso-ramen"], ["shio-ramen", "shio-ramen"],
  ["shoyu-ramen", "shoyu-ramen"], ["chuka-soba", "shoyu-ramen"],
  ["oden", "oden"], ["soba", "kake-soba"], ["udon", "kitsune-udon"], ["ramen", "shoyu-ramen"],
];

/** The recipe a guide style links to: tonkotsu for Hakata, shoyu for plain ramen. */
export function recipeForStyle(styleId: string): RecipeLink | undefined {
  const recipe = PRIORITY.find(([id]) => id === styleId)?.[1];
  return recipe ? recipeLinkBySlug.get(recipe) : undefined;
}

export interface ShopRecipe {
  link: RecipeLink;
  /** "Make miso ramen at home"; a plain udon shop gets "Make udon at home". */
  heading: string;
  style: GuideStyle;
}

export function recipeForShop(shop: Shop): ShopRecipe | undefined {
  for (const [styleId, recipe] of PRIORITY) {
    const style = guideStyleById.get(styleId)!;
    if (!matchesStyle(shop, style)) continue;
    const curry = styleId === "udon" && /カレー|curry/i.test(`${shop.name} ${shop.nameJa}`);
    const link = recipeLinkBySlug.get(curry ? "curry-udon" : recipe)!;
    // A plain udon shop isn't a kitsune udon shop: name the cuisine, and the card names the recipe.
    const subject = curry ? "curry udon" : style.matchedBy === "cuisine" ? style.label : link.title.replace(/ \(.*\)$/, "");
    return { link, style, heading: `Make ${subject.charAt(0).toLowerCase()}${subject.slice(1)} at home` };
  }
  return undefined;
}
