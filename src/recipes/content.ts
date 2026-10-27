/**
 * Soupmap Recipes: the recipe model, parsing and validation. Recipes are Markdown files in
 * content/recipes/ (see its README). Pure functions; the build reads the files.
 */
import { JournalError, LINK, MAP_LINK, SLUG, normalizeHref, parseFrontmatter } from "../journal/content.ts";
import { BASES, DIETS, DIFFICULTIES, REGIONS, SEASONS, TYPES, timeBucket } from "./facets.ts";
import { parseIngredient, type IngredientLine } from "./quantity.ts";

export interface IngredientGroup { title?: string; items: IngredientLine[] }
export interface Step { n: number; text: string }
export interface StepGroup { title?: string; steps: Step[] }

export interface RecipePhoto {
  src: string;
  /** A smaller version for cards and phones. */
  thumb: string;
  width: number;
  height: number;
  alt: string;
  author: string;
  license: string;
  licenseUrl: string;
  /** The file page the photo came from. */
  source: string;
}

export interface Recipe {
  slug: string;
  title: string;
  dek: string;
  mark: string;
  region: string;
  country: string;
  type: string;
  base: string[];
  diet: string[];
  season: string[];
  difficulty: string;
  time: string;
  serves: number;
  active: number;
  total: number;
  /** Preparation and time on the heat, for the scorecard and schema.org prepTime/cookTime. */
  prep: number;
  cook: number;
  /** Editorial 1–10 ratings shown as meters. */
  meters: Meters;
  date: string;
  /** Last substantive change (YYYY-MM-DD), for sitemaps and dateModified. */
  updated?: string;
  journal?: string;
  map?: string;
  mapLabel?: string;
  /** Markdown paragraphs before the first section. */
  headnote: string;
  ingredients: IngredientGroup[];
  method: StepGroup[];
  /** "Restaurant secret": the one technique that makes the difference. */
  secret: string;
  swaps: Swaps;
  tips: string[];
  storage: string[];
  variations: string[];
  ingredientCount: number;
  stepCount: number;
  photo?: RecipePhoto;
  /** Sourced cost per bowl (content/recipes/costs.json); never estimated by us. */
  cost?: RecipeCost;
  /** Sourced nutrition per serving (content/recipes/nutrition.json). */
  nutrition?: RecipeNutrition;
}

/** Per-bowl cost at home against a typical restaurant bowl, with where the prices came from. */
export interface RecipeCost {
  currency: "USD";
  home: number;
  out: number;
  source: string;
  /** YYYY-MM the prices were checked. */
  checked: string;
}

/** Per serving, from a named analysis (a dietitian or a nutrition database run), not a guess. */
export interface RecipeNutrition {
  calories: number;
  /** Grams. */
  protein: number;
  /** Milligrams. */
  sodium: number;
  source: string;
}

export interface Meters { richness: number; spice: number; comfort: number }
export interface Swaps { glutenFree: string[]; plantBased: string[]; highProtein: string[] }
export const SWAP_HEADINGS = { glutenFree: "Gluten-free", plantBased: "Plant-based", highProtein: "High-protein" } as const;

export class RecipeError extends Error {
  constructor(slug: string, message: string) {
    super(`content/recipes/${slug}.md: ${message}`);
  }
}

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const ids = (values: readonly { id: string }[]) => new Set(values.map(v => v.id));
const SECTIONS = ["Ingredients", "Method", "Restaurant secret", "Swaps", "Tips", "Make ahead and storage", "Variations"] as const;
const REQUIRED = new Set(["Ingredients", "Method", "Restaurant secret", "Swaps", "Tips"]);

const countWords = (text: string) => text.match(/[A-Za-zÀ-ɏ0-9'’]+/g)?.length ?? 0;

/** Lines of a section, with indented continuation lines joined to the item above. */
function items(slug: string, section: string, lines: string[], marker: RegExp): { group?: string; text: string }[] {
  const out: { group?: string; text: string }[] = [];
  let group: string | undefined;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const heading = raw.match(/^###\s+(.+)$/);
    if (heading) { group = heading[1]!.trim(); continue; }
    const item = raw.match(marker);
    if (item) { out.push({ ...(group ? { group } : {}), text: raw.replace(marker, "").trim() }); continue; }
    if (/^\s+\S/.test(raw) && out.length) { out.at(-1)!.text += ` ${raw.trim()}`; continue; }
    throw new RecipeError(slug, `in "${section}", every line must be a list item or ### heading; got "${raw.trim().slice(0, 60)}"`);
  }
  return out;
}

function grouped<T>(list: { group?: string; value: T }[]): { title?: string; values: T[] }[] {
  const groups: { title?: string; values: T[] }[] = [];
  for (const { group, value } of list) {
    const last = groups.at(-1);
    if (last && last.title === group) last.values.push(value);
    else groups.push({ ...(group ? { title: group } : {}), values: [value] });
  }
  return groups;
}

export function parseRecipe(slug: string, source: string): Recipe {
  if (!SLUG.test(slug)) throw new RecipeError(slug, "file name must be lowercase-kebab-case");
  let parsed: ReturnType<typeof parseFrontmatter>;
  try { parsed = parseFrontmatter(slug, source); }
  catch (error) { throw error instanceof JournalError ? new RecipeError(slug, error.message.replace(/^content\/journal\/[^:]+: /, "")) : error; }
  const { data, body } = parsed;
  const known = new Set(["title", "dek", "mark", "region", "country", "type", "base", "diet", "season", "difficulty",
    "serves", "active", "total", "prep", "cook", "richness", "spice", "comfort", "date", "updated", "journal", "map", "mapLabel"]);
  for (const key of Object.keys(data)) if (!known.has(key)) throw new RecipeError(slug, `unknown field "${key}"`);
  const text = (key: string, required = true): string | undefined => {
    const value = data[key];
    if (value === undefined) { if (required) throw new RecipeError(slug, `missing "${key}"`); return undefined; }
    if (typeof value !== "string" || !value.trim()) throw new RecipeError(slug, `"${key}" must be a single line of text`);
    return value.trim();
  };
  const oneOf = (key: string, allowed: Set<string>) => {
    const value = text(key)!;
    if (!allowed.has(value)) throw new RecipeError(slug, `"${key}" must be one of ${[...allowed].join(", ")}; got "${value}"`);
    return value;
  };
  const listOf = (key: string, allowed: Set<string>, min: number, max: number) => {
    const value = data[key] ?? [];
    const list = typeof value === "string" ? [value] : value;
    if (list.length < min || list.length > max) throw new RecipeError(slug, `"${key}" needs ${min}–${max} items`);
    for (const item of list) if (!allowed.has(item)) throw new RecipeError(slug, `"${key}" has unknown value "${item}"`);
    if (new Set(list).size !== list.length) throw new RecipeError(slug, `"${key}" repeats a value`);
    return list;
  };
  const integer = (key: string, min: number, max: number) => {
    const value = Number(text(key));
    if (!Number.isInteger(value) || value < min || value > max) throw new RecipeError(slug, `"${key}" must be a whole number from ${min} to ${max}`);
    return value;
  };

  const title = text("title")!;
  const dek = text("dek")!;
  if (dek.length > 220) throw new RecipeError(slug, "dek is longer than 220 characters");
  const mark = text("mark")!;
  if (!JAPANESE.test(mark) || [...mark].length > 10) throw new RecipeError(slug, "mark must be 1–10 Japanese characters");
  const region = oneOf("region", ids(REGIONS));
  const country = text("country")!;
  const type = oneOf("type", ids(TYPES));
  const base = listOf("base", ids(BASES), 1, 2);
  const diet = listOf("diet", ids(DIETS), 0, 4);
  if (diet.includes("vegan") && !diet.includes("vegetarian")) diet.unshift("vegetarian");
  const season = listOf("season", ids(SEASONS), 1, 4);
  const difficulty = oneOf("difficulty", ids(DIFFICULTIES));
  const serves = integer("serves", 1, 12);
  const active = integer("active", 1, 24 * 60);
  const total = integer("total", 1, 48 * 60);
  if (active > total) throw new RecipeError(slug, "active time can't be longer than total time");
  const prep = integer("prep", 1, 24 * 60);
  const cook = integer("cook", 0, 48 * 60);
  if (prep + cook > total) throw new RecipeError(slug, `prep (${prep}) + cook (${cook}) can't be longer than total (${total})`);
  const meters: Meters = { richness: integer("richness", 1, 10), spice: integer("spice", 1, 10), comfort: integer("comfort", 1, 10) };
  const date = text("date")!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new RecipeError(slug, "date must be YYYY-MM-DD");
  const updated = text("updated", false);
  if (updated && (!/^\d{4}-\d{2}-\d{2}$/.test(updated) || Number.isNaN(Date.parse(`${updated}T00:00:00Z`)) || updated < date)) throw new RecipeError(slug, "updated must be YYYY-MM-DD, on or after date");
  const journal = text("journal", false);
  if (journal && !SLUG.test(journal)) throw new RecipeError(slug, `bad journal slug "${journal}"`);
  const rawMap = text("map", false);
  const map = rawMap ? normalizeHref(rawMap) : undefined;
  const mapLabel = text("mapLabel", false);
  if (map && !MAP_LINK.test(map)) throw new RecipeError(slug, `map must be /map/?q=<words>, got "${map}"`);
  if (!!map !== !!mapLabel) throw new RecipeError(slug, "map and mapLabel go together");

  if (/^#\s/m.test(body)) throw new RecipeError(slug, "use ## for sections; the title is the only h1");
  const parts = body.split(/^##\s+/m);
  const headnote = parts.shift()!.trim();
  const words = countWords(headnote);
  if (words < 50 || words > 300) throw new RecipeError(slug, `headnote should be 80–220 words (has ${words})`);
  const sections = new Map<string, string[]>();
  let order = -1;
  for (const part of parts) {
    const [heading, ...rest] = part.split("\n");
    const name = heading!.trim();
    const index = SECTIONS.indexOf(name as typeof SECTIONS[number]);
    if (index < 0) throw new RecipeError(slug, `unknown section "## ${name}"; use ${SECTIONS.join(", ")}`);
    if (index <= order) throw new RecipeError(slug, `section "## ${name}" is out of order or repeated`);
    order = index;
    sections.set(name, rest);
  }
  for (const name of REQUIRED) if (!sections.has(name)) throw new RecipeError(slug, `missing "## ${name}"`);

  const ingredientItems = items(slug, "Ingredients", sections.get("Ingredients")!, /^[-*]\s+/);
  if (ingredientItems.length < 3) throw new RecipeError(slug, "needs at least 3 ingredients");
  const ingredients = grouped(ingredientItems.map(i => ({ group: i.group, value: parseIngredient(i.text) })))
    .map(g => ({ ...(g.title ? { title: g.title } : {}), items: g.values }));

  const stepItems = items(slug, "Method", sections.get("Method")!, /^\d+\.\s+/);
  if (stepItems.length < 3) throw new RecipeError(slug, "needs at least 3 method steps");
  const numbers = (sections.get("Method")!).map(line => line.match(/^(\d+)\.\s+/)?.[1]).filter(Boolean).map(Number);
  numbers.forEach((n, i) => { if (n !== i + 1) throw new RecipeError(slug, `method steps must be numbered 1, 2, 3… straight through (step ${i + 1} is numbered ${n})`); });
  const method = grouped(stepItems.map((s, i) => ({ group: s.group, value: { n: i + 1, text: s.text } })))
    .map(g => ({ ...(g.title ? { title: g.title } : {}), steps: g.values }));

  const bullets = (name: string) => sections.has(name) ? items(slug, name, sections.get(name)!, /^[-*]\s+/).map(i => i.text) : [];
  const tips = bullets("Tips");
  if (tips.length < 3 || tips.length > 7) throw new RecipeError(slug, `"## Tips" needs 3–6 bullets (has ${tips.length})`);
  const storage = bullets("Make ahead and storage");
  const variations = bullets("Variations");

  const secret = sections.get("Restaurant secret")!.map(l => l.trim()).filter(Boolean).join(" ");
  if (/^[-*\d#]/.test(secret)) throw new RecipeError(slug, `"## Restaurant secret" is one paragraph, not a list`);
  const secretWords = countWords(secret);
  if (secretWords < 25 || secretWords > 120) throw new RecipeError(slug, `"## Restaurant secret" should be 30–90 words (has ${secretWords})`);
  const swaps = (() => {
    const list = items(slug, "Swaps", sections.get("Swaps")!, /^[-*]\s+/);
    const groups = (Object.entries(SWAP_HEADINGS) as [keyof Swaps, string][]).map(([key, heading]) => {
      const values = list.filter(i => i.group === heading).map(i => i.text);
      if (values.length < 1 || values.length > 3) throw new RecipeError(slug, `"### ${heading}" under Swaps needs 1–3 bullets (has ${values.length})`);
      return [key, values] as const;
    });
    const unknown = list.find(i => !Object.values(SWAP_HEADINGS).includes(i.group as never));
    if (unknown) throw new RecipeError(slug, `Swaps only takes ### Gluten-free, ### Plant-based and ### High-protein (found "${unknown.group ?? "no heading"}")`);
    return Object.fromEntries(groups) as unknown as Swaps;
  })();

  const recipe: Recipe = {
    slug, title, dek, mark, region, country, type, base, diet, season, difficulty, time: timeBucket(total),
    serves, active, total, prep, cook, meters, date, ...(updated ? { updated } : {}), headnote, ingredients, method, secret, swaps, tips, storage, variations,
    ingredientCount: ingredientItems.length, stepCount: stepItems.length,
    ...(journal ? { journal } : {}), ...(map ? { map, mapLabel } : {}),
  };
  const conflicts = dietConflicts(recipe);
  if (conflicts.length) throw new RecipeError(slug, conflicts.join("; "));
  return recipe;
}

// ── Diet checks ──────────────────────────────────────────────────────────────
// A tag is a promise to someone with an allergy or a belief. These rules catch the common
// mistakes (dashi is fish, soy sauce has wheat, "vegetable" soups made with chicken stock).

const MEAT = /\b(chicken|pork|beef|lamb|mutton|veal|bacon|ham|pancetta|prosciutto|chorizo|chouriço|sausages?|andouille|salt pork|lard|gelatine?|bones?|marrow|oxtail|duck|turkey)\b/i;
const SEAFOOD = /\b(fish|anchov(y|ies)|katsuobushi|bonito|niboshi|sardines?|shrimps?|prawns?|clams?|mussels?|oysters?|crab|squid|scallops?|belacan|shrimp paste|fish sauce|worcestershire|kamaboko|chikuwa|hanpen|satsuma-age|dashi)\b/i;
const STOCK = /\b(stock|broth|bouillon)\b/i;
const VEGETARIAN_OK = /\b(kombu dashi|kombu-shiitake dashi|shiitake dashi|vegetable dashi|vegan|vegetarian|vegetable stock|vegetable broth|mushroom stock)\b/i;
const ANIMAL_CHEESE = /\b(parmesan|parmigiano|pecorino|grana padano)\b/i;
const DAIRY = /\b(butter|milk|cream|cheese|yog(h)?urt|ghee|smetana|sour cream|crème fraîche|creme fraiche|gruy[eè]re|comt[eé]|parmesan|parmigiano|pecorino|buttermilk|whey)\b/i;
const DAIRY_OK = /\b(peanut butter|nut butter|almond butter|coconut milk|coconut cream|oat milk|soy milk|soya milk|almond milk|plant milk|vegan butter|dairy-free)\b/gi;
const EGG = /\b(eggs?|egg yolks?|egg whites?|mayonnaise|honey)\b/i;
const EGG_OK = /\b(eggplants?|egg-free)\b/gi;
const GLUTEN = /\b(flour|wheat|soy sauce|shoyu|noodles?|udon|ramen|soba|somen|pasta|orzo|bread|baguette|croutons?|breadcrumbs|panko|barley|malt|couscous|bulgur|seitan|crackers?|tortillas?|vermicelli|miso|doenjang|gochujang|oyster sauce|hoisin|tianmianjiang|beer|mochi|fu)\b/i;
const GLUTEN_OK = /\b(gluten-free [a-z ]+|tamari|buckwheat|rice flour|corn ?flour|cornstarch|potato starch|tapioca|masa|chickpea flour|rice noodles?|rice vermicelli|glass noodles|corn tortillas?|100% buckwheat)\b/gi;

function lines(recipe: Recipe): string[] {
  return recipe.ingredients.flatMap(g => g.items.map(i => i.text));
}

export function dietConflicts(recipe: Recipe): string[] {
  const problems: string[] = [];
  const check = (tag: string, bad: RegExp, ok?: RegExp, whole?: RegExp) => {
    if (!recipe.diet.includes(tag)) return;
    for (const line of lines(recipe)) {
      if (whole?.test(line)) continue;
      const cleaned = ok ? line.replace(ok, " ") : line;
      const hit = cleaned.match(bad);
      if (hit) problems.push(`tagged ${tag} but lists "${line}" (${hit[0]})`);
    }
  };
  check("vegetarian", MEAT, undefined, VEGETARIAN_OK);
  check("vegetarian", SEAFOOD, undefined, VEGETARIAN_OK);
  check("vegetarian", STOCK, undefined, VEGETARIAN_OK);
  check("vegetarian", ANIMAL_CHEESE, /\bvegetarian [a-z]+/gi);
  check("vegan", DAIRY, DAIRY_OK);
  check("vegan", EGG, EGG_OK);
  check("dairy-free", DAIRY, DAIRY_OK);
  check("gluten-free", GLUTEN, GLUTEN_OK);
  return problems;
}

/** Cross-recipe checks: journal links and internal links must point at real pages. */
export function validateRecipes(recipes: readonly Recipe[], journalSlugs: ReadonlySet<string>): string[] {
  const slugs = new Set(recipes.map(r => r.slug));
  const problems: string[] = [];
  for (const recipe of recipes) {
    if (recipe.journal && !journalSlugs.has(recipe.journal)) problems.push(`${recipe.slug}: journal "${recipe.journal}" does not exist`);
    const prose = [recipe.headnote, recipe.secret, ...Object.values(recipe.swaps).flat(), ...recipe.tips, ...recipe.storage, ...recipe.variations,
      ...recipe.method.flatMap(g => g.steps.map(s => s.text))].join("\n");
    for (const [, , raw] of prose.matchAll(LINK)) {
      const href = raw!.trim();
      const journal = href.match(/^\/journal\/([a-z0-9-]+)\/$/);
      const own = href.match(/^\/recipes\/([a-z0-9-]+)\/$/);
      if (journal && !journalSlugs.has(journal[1]!)) problems.push(`${recipe.slug}: link to missing essay ${href}`);
      else if (own && !slugs.has(own[1]!)) problems.push(`${recipe.slug}: link to missing recipe ${href}`);
      else if (!journal && !own) problems.push(`${recipe.slug}: links may only go to /journal/<slug>/ or /recipes/<slug>/ (got ${href})`);
    }
  }
  return problems;
}

/** Same region and kind first, then same kind, then same region. */
export function relatedRecipes(recipe: Recipe, all: readonly Recipe[], count = 3): Recipe[] {
  const score = (r: Recipe) => (r.region === recipe.region ? 2 : 0) + (r.type === recipe.type ? 3 : 0)
    + r.base.filter(b => recipe.base.includes(b)).length;
  return all.filter(r => r.slug !== recipe.slug)
    .sort((a, b) => score(b) - score(a) || a.title.localeCompare(b.title)).slice(0, count);
}
