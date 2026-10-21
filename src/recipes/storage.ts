/** Recipes and notes belong to accounts; units/checks are cooking preferences only. */
import { accountEntries, putAccountEntry } from "../personal-entries.ts";
import { ApiError, requireSaveAccount } from "../personal-saves.ts";

export const SAVED_RECIPES_KEY = "soupmap:recipes:saved:v1";
export const NOTES_KEY = "soupmap:recipes:notes:v1";
export const UNITS_KEY = "soupmap:recipes:units:v1";
const checksKey = (slug: string) => `soupmap:recipes:checks:${slug}`;
const stepsKey = (slug: string) => `soupmap:recipes:steps:${slug}`;

function read(storage: Pick<Storage, "getItem"> | null, key: string): unknown {
  try { return JSON.parse(storage?.getItem(key) ?? "null"); } catch { return null; }
}
function write(storage: Pick<Storage, "setItem"> | null, key: string, value: unknown): boolean {
  try { storage?.setItem(key, JSON.stringify(value)); return !!storage; } catch { return false; }
}
const local = () => { try { return window.localStorage; } catch { return null; } };
const session = () => { try { return window.sessionStorage; } catch { return null; } };

type RecipeMemory = {saved:boolean;note:string};
let memories: Record<string,RecipeMemory> = {};
export async function loadRecipeStorage(): Promise<void> {
  try { memories=await accountEntries<RecipeMemory>("recipe"); }
  catch(error) { memories={}; if (!(error instanceof ApiError && error.status===401)) throw error; }
}
export function savedRecipes(): Set<string> {
  return new Set(Object.keys(memories).filter(slug=>memories[slug]?.saved));
}
export async function setRecipeSaved(slug: string, saved: boolean): Promise<boolean> {
  if (!await requireSaveAccount("recipe")) return false;
  await loadRecipeStorage();
  const value={saved,note:memories[slug]?.note ?? ""};
  await putAccountEntry("recipe",slug,value);
  memories[slug]=value;
  return true;
}

export function recipeNote(slug: string): string {
  return memories[slug]?.note ?? "";
}
export async function setRecipeNote(slug: string, note: string): Promise<boolean> {
  if (!await requireSaveAccount("note")) return false;
  await loadRecipeStorage();
  const value={saved:memories[slug]?.saved ?? false,note:note.slice(0,2000)};
  await putAccountEntry("recipe",slug,value);
  memories[slug]=value;
  return true;
}

export function preferredUnits(): "metric" | "us" {
  return read(local(), UNITS_KEY) === "us" ? "us" : "metric";
}
export function setPreferredUnits(units: "metric" | "us"): void { write(local(), UNITS_KEY, units); }

/** Ticked ingredients last only for this tab: they're for the cook in progress. */
export function checkedIngredients(slug: string): number[] {
  const value = read(session(), checksKey(slug));
  return Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)) : [];
}
export function setCheckedIngredients(slug: string, indexes: number[]): void { write(session(), checksKey(slug), indexes); }

/** Steps ticked off in this tab, by step number. */
export function checkedSteps(slug: string): number[] {
  const value = read(session(), stepsKey(slug));
  return Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
}
export function setCheckedSteps(slug: string, steps: number[]): void { write(session(), stepsKey(slug), steps); }
