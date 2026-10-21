/** Node-only: read and validate every recipe in content/recipes/ (build and tests). */
import { readdirSync, readFileSync } from "node:fs";
import { parseRecipe, validateRecipes, type Recipe, type RecipePhoto } from "./content.ts";
import photos from "../data/recipe-photos.json" with { type: "json" };

export const RECIPES_DIR = new URL("../../content/recipes/", import.meta.url);

export function loadRecipes(journalSlugs: ReadonlySet<string>, dir: URL = RECIPES_DIR): Recipe[] {
  const files = readdirSync(dir).filter(name => name.endsWith(".md") && name !== "README.md").sort();
  const credits = photos as Record<string, RecipePhoto>;
  const recipes = files.map(name => {
    const recipe = parseRecipe(name.slice(0, -3), readFileSync(new URL(name, dir), "utf8"));
    const photo = credits[recipe.slug];
    return photo ? { ...recipe, photo } : recipe;
  });
  const problems = validateRecipes(recipes, journalSlugs);
  if (problems.length) throw new Error(`Recipe content problems:\n- ${problems.join("\n- ")}`);
  return recipes;
}
