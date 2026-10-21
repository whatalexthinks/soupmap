/** Per-visitor recipe conveniences kept in this browser: saved recipes, notes, units, checked ingredients. */

export const SAVED_RECIPES_KEY = "soupmap:recipes:saved:v1";
export const NOTES_KEY = "soupmap:recipes:notes:v1";
export const UNITS_KEY = "soupmap:recipes:units:v1";
const checksKey = (slug: string) => `soupmap:recipes:checks:${slug}`;

function read(storage: Pick<Storage, "getItem"> | null, key: string): unknown {
  try { return JSON.parse(storage?.getItem(key) ?? "null"); } catch { return null; }
}
function write(storage: Pick<Storage, "setItem"> | null, key: string, value: unknown): boolean {
  try { storage?.setItem(key, JSON.stringify(value)); return !!storage; } catch { return false; }
}
const local = () => { try { return window.localStorage; } catch { return null; } };
const session = () => { try { return window.sessionStorage; } catch { return null; } };

export function savedRecipes(): Set<string> {
  const value = read(local(), SAVED_RECIPES_KEY);
  return new Set(Array.isArray(value) ? value.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{1,120}$/.test(s)).slice(0, 500) : []);
}
export function setRecipeSaved(slug: string, saved: boolean): boolean {
  const all = savedRecipes();
  if (saved) all.add(slug); else all.delete(slug);
  return write(local(), SAVED_RECIPES_KEY, [...all]);
}

export function recipeNote(slug: string): string {
  const value = read(local(), NOTES_KEY) as Record<string, unknown> | null;
  const note = value && typeof value === "object" ? value[slug] : "";
  return typeof note === "string" ? note.slice(0, 2000) : "";
}
export function setRecipeNote(slug: string, note: string): boolean {
  const value = read(local(), NOTES_KEY);
  const notes = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
  if (note.trim()) notes[slug] = note.slice(0, 2000); else delete notes[slug];
  return write(local(), NOTES_KEY, notes);
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
