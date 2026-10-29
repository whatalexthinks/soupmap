/** Node-only: read and validate every recipe in content/recipes/ (build and tests). */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseRecipe, validateRecipes, type Recipe, type RecipeCost, type RecipeNutrition, type RecipePhoto } from "./content.ts";
import photos from "../data/recipe-photos.json" with { type: "json" };

export const RECIPES_DIR = new URL("../../content/recipes/", import.meta.url);

const json = (dir: URL, name: string): Record<string, unknown> =>
  existsSync(new URL(name, dir)) ? JSON.parse(readFileSync(new URL(name, dir), "utf8")) as Record<string, unknown> : {};
const positive = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
const sourced = (value: unknown) => typeof value === "string" && value.trim().length >= 10;

/** costs.json: { "<slug>": { currency: "USD", home, out, source, checked: "YYYY-MM" } }. */
export function checkCost(slug: string, value: unknown): RecipeCost {
  const cost = value as Partial<RecipeCost>;
  if (cost?.currency !== "USD" || !positive(cost.home, 100) || !positive(cost.out, 200) || !sourced(cost.source) || !/^\d{4}-\d{2}$/.test(cost.checked ?? ""))
    throw new Error(`content/recipes/costs.json: "${slug}" needs currency "USD", home and out prices, a source and checked: "YYYY-MM"`);
  return { currency: "USD", home: cost.home!, out: cost.out!, source: cost.source!, checked: cost.checked! };
}

/** nutrition.json: { "<slug>": { calories, protein (g), sodium (mg), source } } per serving. */
export function checkNutrition(slug: string, value: unknown): RecipeNutrition {
  const n = value as Partial<RecipeNutrition>;
  if (!positive(n?.calories, 3000) || !positive(n.protein, 300) || !positive(n.sodium, 20000) || !sourced(n.source))
    throw new Error(`content/recipes/nutrition.json: "${slug}" needs calories, protein (g), sodium (mg) and a source`);
  return { calories: n.calories!, protein: n.protein!, sodium: n.sodium!, source: n.source! };
}

export function loadRecipes(journalSlugs: ReadonlySet<string>, dir: URL = RECIPES_DIR): Recipe[] {
  const files = readdirSync(dir).filter(name => name.endsWith(".md") && name !== "README.md").sort();
  const credits = photos as Record<string, RecipePhoto>;
  const costs = json(dir, "costs.json");
  const nutrition = json(dir, "nutrition.json");
  const recipes = files.map(name => {
    const recipe = parseRecipe(name.slice(0, -3), readFileSync(new URL(name, dir), "utf8"));
    const photo = credits[recipe.slug];
    return {
      ...recipe, ...(photo ? { photo } : {}),
      ...(costs[recipe.slug] ? { cost: checkCost(recipe.slug, costs[recipe.slug]) } : {}),
      ...(nutrition[recipe.slug] ? { nutrition: checkNutrition(recipe.slug, nutrition[recipe.slug]) } : {}),
    };
  });
  const slugs = new Set(recipes.map(r => r.slug));
  for (const [file, data] of [["costs.json", costs], ["nutrition.json", nutrition]] as const)
    for (const slug of Object.keys(data)) if (!slugs.has(slug)) throw new Error(`content/recipes/${file}: no recipe called "${slug}"`);
  const problems = validateRecipes(recipes, journalSlugs);
  if (problems.length) throw new Error(`Recipe content problems:\n- ${problems.join("\n- ")}`);
  return recipes;
}
