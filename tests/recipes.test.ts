import test from "node:test";
import assert from "node:assert/strict";
import { loadJournal } from "../src/journal/load.ts";
import { loadRecipes } from "../src/recipes/load.ts";
import { parseRecipe, dietConflicts, type Recipe } from "../src/recipes/content.ts";
import { FACETS, REGIONS, timeBucket } from "../src/recipes/facets.ts";
import { findDurations, formatAmount, isoDuration, parseIngredient, scaleAmount } from "../src/recipes/quantity.ts";
import { recipePages, recipeDetailPage, recipesHead, orderRecipes } from "../src/render/recipes.ts";
import { allowedLicense, describe, plainText } from "../scripts/fetch-recipe-photos.ts";
import { getSource } from "../src/sources.ts";
import photos from "../src/data/recipe-photos.json" with { type: "json" };

const journalSlugs = new Set(loadJournal().map(a => a.slug));
const recipes = loadRecipes(journalSlugs);
const bySlug = new Map(recipes.map(r => [r.slug, r]));

const SAMPLE = (overrides: Record<string, string> = {}, body = "") => {
  const fields = { title: "Test soup", dek: "A soup for tests.", mark: "汁", region: "japan", country: "Japan", type: "clear",
    base: "\n  - vegetable", season: "\n  - winter", difficulty: "easy", serves: "2", active: "10", total: "20", prep: "5", cook: "15",
    richness: "2", spice: "1", comfort: "6", date: "2026-10-20", ...overrides };
  const text = body || `## Ingredients\n- 1 l water\n- 1 onion, sliced\n- Salt, to taste\n\n## Method\n1. Boil the water for 5 minutes.\n2. Add the onion.\n3. Season.\n\n## Tips\n- One.\n- Two.\n- Three.`;
  // Bodies that leave out the required secret and swaps get the standard ones before Tips.
  const full = text.includes("## Restaurant secret") || !text.includes("## Tips") ? text : text.replace("## Tips", `${EXTRA}## Tips`);
  return `---\n${Object.entries(fields).map(([k, v]) => `${k}:${v.startsWith("\n") ? v : ` ${v}`}`).join("\n")}\n---\n\n${"Words that set the scene and explain the soup. ".repeat(12)}\n\n${full}`;
};
const EXTRA = `## Restaurant secret\n${"Salt the onion early so it softens and sweetens the water. ".repeat(3)}\n\n## Swaps\n### Gluten-free\n- Already gluten-free.\n\n### Plant-based\n- Already vegan.\n\n### High-protein\n- Add tofu.\n\n`;

test("every recipe parses, validates and covers the browse facets", () => {
  assert.ok(recipes.length >= 36, `expected at least 36 recipes, got ${recipes.length}`);
  for (const region of REGIONS) assert.ok(recipes.some(r => r.region === region.id), `no recipe for ${region.id}`);
  for (const id of ["noodle", "clear", "hearty", "creamy", "chilled", "hot-pot"]) assert.ok(recipes.some(r => r.type === id), `no ${id} recipe`);
  for (const id of ["vegetarian", "vegan", "gluten-free", "dairy-free"]) assert.ok(recipes.some(r => r.diet.includes(id)), `no ${id} recipe`);
  for (const recipe of recipes) {
    assert.ok(recipe.ingredientCount >= 3 && recipe.stepCount >= 3 && recipe.tips.length >= 3, recipe.slug);
    assert.ok(recipe.active <= recipe.total, recipe.slug);
    assert.equal(recipe.time, timeBucket(recipe.total));
    if (recipe.diet.includes("vegan")) assert.ok(recipe.diet.includes("vegetarian"), `${recipe.slug}: vegan implies vegetarian`);
    // Most ingredient lines carry an amount the scaler can use.
    const items = recipe.ingredients.flatMap(g => g.items);
    assert.ok(items.filter(i => i.amount).length / items.length >= 0.7, `${recipe.slug}: too few scalable ingredient lines`);
  }
});

test("ingredient amounts parse, scale and convert like a cook would expect", () => {
  assert.deepEqual(parseIngredient("1 1/2 tbsp mirin"), { amount: { min: 1.5, unit: "tbsp" }, text: "mirin" });
  assert.deepEqual(parseIngredient("2–3 dried chillies"), { amount: { min: 2, max: 3, unit: "" }, text: "dried chillies" });
  assert.deepEqual(parseIngredient("2 large eggs").amount, { min: 2, unit: "" }, "the l in large is not litres");
  assert.deepEqual(parseIngredient("½ tsp salt").amount, { min: 0.5, unit: "tsp" });
  assert.deepEqual(parseIngredient("Salt, to taste"), { text: "Salt, to taste" });
  const fmt = (line: string, factor = 1, system: "metric" | "us" = "metric") => formatAmount(scaleAmount(parseIngredient(line).amount!, factor), system);
  assert.equal(fmt("500 g pork belly", 2), "1 kg");
  assert.equal(fmt("1.5 l water", 0.5), "750 ml");
  assert.equal(fmt("3 tbsp soy sauce", 0.5), "1½ tbsp");
  assert.equal(fmt("1 tsp salt", 3), "1 tbsp");
  assert.equal(fmt("2–3 dried chillies", 0.5), "1–1½");
  assert.equal(fmt("1 onion", 0.25), "¼");
  assert.equal(fmt("4 star anise", 8 / 6), "5", "counts round to whole items from 3 up");
  assert.equal(fmt("2 onions", 8 / 6), "2½");
  assert.equal(fmt("500 g pork belly", 1, "us"), "1.1 lb");
  assert.equal(fmt("100 g miso", 1, "us"), "3½ oz");
  assert.equal(fmt("1 l dashi", 1, "us"), "4¼ cups");
  assert.equal(fmt("30 ml mirin", 1, "us"), "2 tbsp");
  assert.equal(fmt("10 cm piece ginger", 1, "us"), "4 in");
  assert.equal(fmt("2 tbsp sake", 1, "us"), "2 tbsp");
  assert.deepEqual(findDurations("Simmer 10–12 minutes, rest 1 hour, then 2 1/2 hours. Stir for 5 seconds.").map(d => d.seconds), [600, 3600, 9000]);
  assert.equal(isoDuration(90), "PT1H30M");
  assert.equal(isoDuration(45), "PT45M");
});

test("the parser explains what's wrong with a recipe file", () => {
  assert.doesNotThrow(() => parseRecipe("test-soup", SAMPLE()));
  const fails = (source: string, message: RegExp) => assert.throws(() => parseRecipe("test-soup", source), message);
  fails(SAMPLE({ region: "mars" }), /"region" must be one of/);
  fails(SAMPLE({ active: "30", total: "20" }), /active time can't be longer/);
  fails(SAMPLE({ mark: "Soup" }), /mark must be/);
  fails(SAMPLE({ extra: "x" }), /unknown field "extra"/);
  fails(SAMPLE({}, "## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Method\n1. One.\n3. Two.\n4. Three.\n\n## Tips\n- a\n- b\n- c"), /numbered 1, 2, 3/);
  fails(SAMPLE({}, "## Method\n1. One.\n2. Two.\n3. Three.\n\n## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Tips\n- a\n- b\n- c"), /out of order/);
  fails(SAMPLE({}, "## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Method\n1. One.\n2. Two.\n3. Three.\n\n## Serving\n- a"), /unknown section/);
  fails(SAMPLE({}, "## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Method\n1. One.\n2. Two.\n3. Three.\n\n## Tips\n- a"), /3–6 bullets/);
  fails(SAMPLE({ prep: "10", cook: "15" }), /prep \(10\) \+ cook \(15\) can't be longer than total/);
  fails(SAMPLE({ spice: "11" }), /"spice"/);
  fails(SAMPLE({}, "## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Method\n1. One.\n2. Two.\n3. Three."), /missing "## Restaurant secret"/);
  fails(SAMPLE({}, EXTRA.replace("### High-protein\n- Add tofu.\n", "").replace("## Restaurant secret", "## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Method\n1. One.\n2. Two.\n3. Three.\n\n## Restaurant secret") + "## Tips\n- a\n- b\n- c"), /High-protein" under Swaps needs 1–3 bullets/);
  fails(SAMPLE({}, EXTRA.replace("Salt the onion early", "- Salt the onion early").replace("## Restaurant secret", "## Ingredients\n- 1 l water\n- 1 onion\n- salt\n\n## Method\n1. One.\n2. Two.\n3. Three.\n\n## Restaurant secret") + "## Tips\n- a\n- b\n- c"), /one paragraph, not a list/);
});

test("diet tags are checked against the ingredient list", () => {
  const tagged = (diet: string, lines: string[]) => {
    const body = `## Ingredients\n${lines.map(l => `- ${l}`).join("\n")}\n\n## Method\n1. One.\n2. Two.\n3. Three.\n\n## Tips\n- a\n- b\n- c`;
    try { parseRecipe("test-soup", SAMPLE({ diet: `\n  - ${diet}` }, body)); return null; } catch (error) { return (error as Error).message; }
  };
  assert.match(tagged("vegetarian", ["1 l dashi", "1 onion", "1 tbsp miso"])!, /dashi/);
  assert.equal(tagged("vegetarian", ["1 l kombu dashi", "1 onion", "1 tbsp miso"]), null);
  assert.match(tagged("vegetarian", ["1 l chicken stock", "1 onion", "salt"])!, /chicken/);
  assert.match(tagged("vegetarian", ["1 l stock", "1 onion", "salt"])!, /stock/);
  assert.match(tagged("vegetarian", ["30 g parmesan", "1 onion", "salt"])!, /parmesan/);
  assert.match(tagged("vegan", ["30 g butter", "1 onion", "salt"])!, /butter/);
  assert.equal(tagged("vegan", ["2 tbsp peanut butter", "1 eggplant", "400 ml coconut milk"]), null);
  assert.match(tagged("gluten-free", ["2 tbsp soy sauce", "1 onion", "salt"])!, /soy sauce/);
  assert.equal(tagged("gluten-free", ["2 tbsp tamari", "200 g rice noodles", "salt"]), null);
  assert.match(tagged("gluten-free", ["200 g buckwheat noodles", "1 onion", "salt"])!, /noodles/);
  assert.match(tagged("dairy-free", ["100 ml cream", "1 onion", "salt"])!, /cream/);
  // And the real recipes hold up.
  for (const recipe of recipes) assert.deepEqual(dietConflicts(recipe), [], recipe.slug);
});

test("pages: index, browse pages and recipe pages with schema.org Recipe data", () => {
  const pages = recipePages(recipes);
  const paths = pages.map(p => p.path);
  assert.equal(new Set(paths).size, paths.length);
  assert.ok(paths.includes("/recipes/") && paths.includes("/recipes/region/japan/") && paths.includes("/recipes/diet/vegan/"));
  for (const recipe of recipes) assert.ok(paths.includes(`/recipes/${recipe.slug}/`));
  const vegan = pages.find(p => p.path === "/recipes/diet/vegan/")!;
  const cards = [...vegan.main.matchAll(/data-slug="([^"]+)"/g)].map(m => m[1]!);
  assert.ok(cards.length && cards.every(slug => bySlug.get(slug)!.diet.includes("vegan")));

  const recipe = orderRecipes(recipes)[0]!;
  const page = recipeDetailPage(recipe, recipes);
  // Every ingredient has a checkbox; scalable ones carry their amount for the scaler.
  assert.equal(page.main.match(/class="r-ing__check"/g)!.length, recipe.ingredientCount);
  assert.equal(page.main.match(/class="r-qty"/g)?.length ?? 0, recipe.ingredients.flatMap(g => g.items).filter(i => i.amount).length);
  assert.equal(page.main.match(/class="r-step"/g)!.length, recipe.stepCount);
  assert.match(page.main, /class="r-timer" data-seconds="\d+"/);
  // No photo yet: a typographic panel, never an <img>.
  if (!recipe.photo) assert.ok(page.main.includes("r-art") && !page.main.includes("<img"));
  const head = recipesHead(page, "https://soupmap.example", recipes);
  const data = JSON.parse(head.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!);
  assert.equal(data["@type"], "Recipe");
  assert.equal(data.recipeIngredient.length, recipe.ingredientCount);
  assert.equal(data.recipeInstructions.flatMap((s: { itemListElement: unknown[] }) => s.itemListElement).length, recipe.stepCount);
  assert.equal(data.totalTime, isoDuration(recipe.total));
  assert.equal(data.image, undefined, "no image is claimed without a photo");
  assert.ok(!head.includes("</script><script") || head.split("application/ld+json").length === 3);
});

test("a recipe with a photo credits its author and licence", () => {
  const recipe: Recipe = { ...recipes[0]!, photo: { src: "/images/recipes/x.jpg", thumb: "/images/recipes/x-640.jpg", width: 1600, height: 1067,
    alt: "A bowl of soup", author: "A. Photographer", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", source: "https://commons.wikimedia.org/wiki/File:X.jpg" } };
  const page = recipeDetailPage(recipe, recipes);
  assert.match(page.main, /<img class="r-photo" src="\/images\/recipes\/x\.jpg"/);
  assert.match(page.main, /Photo: A\. Photographer, <a href="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/" rel="license noopener"/);
  const data = JSON.parse(recipesHead(page, "https://s.example", recipes).match(/ld\+json">(.*?)<\/script>/)![1]!);
  assert.deepEqual(data.image, ["https://s.example/images/recipes/x.jpg"]);
});

test("photos: only free licences, with an author to credit", async () => {
  for (const name of ["CC BY-SA 4.0", "CC BY 2.0", "CC0", "Public domain", "CC BY-SA 3.0"]) assert.ok(allowedLicense(name), name);
  for (const name of ["CC BY-NC-SA 4.0", "CC BY-ND 2.0", "All rights reserved", "Fair use", "GFDL", ""]) assert.ok(!allowedLicense(name), name);
  assert.equal(plainText('<a href="//commons.wikimedia.org/wiki/User:Kiyo">Kiyo &amp; Co</a>'), "Kiyo & Co");
  const reply = (license: string, width = 4000, artist = '<a href="#">Kiyo</a>') => (async () => Response.json({ query: { pages: { "1": { title: "File:Soup.jpg", imageinfo: [{
    url: "https://upload.wikimedia.org/x/Soup.jpg", thumburl: "https://upload.wikimedia.org/thumb/x/Soup.jpg/1600px-Soup.jpg", thumbwidth: 1600, thumbheight: 1200,
    width, height: width * 0.75, descriptionurl: "https://commons.wikimedia.org/wiki/File:Soup.jpg", mime: "image/jpeg",
    extmetadata: { LicenseShortName: { value: license }, Artist: { value: artist }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" } } }] } } } })) as unknown as typeof fetch;
  const ok = await describe("miso-soup", { file: "File:Soup.jpg", alt: "Miso soup in a lacquer bowl" }, reply("CC BY-SA 4.0"));
  assert.deepEqual(ok.credit, { src: "/images/recipes/miso-soup.jpg", thumb: "/images/recipes/miso-soup-640.jpg", width: 1600, height: 1200,
    alt: "Miso soup in a lacquer bowl", author: "Kiyo", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    source: "https://commons.wikimedia.org/wiki/File:Soup.jpg" });
  assert.equal(ok.thumb, "https://upload.wikimedia.org/thumb/x/Soup.jpg/640px-Soup.jpg");
  await assert.rejects(describe("miso-soup", { file: "File:Soup.jpg", alt: "x" }, reply("CC BY-NC 2.0")), /can't use/);
  await assert.rejects(describe("miso-soup", { file: "File:Soup.jpg", alt: "x" }, reply("CC BY 4.0", 640)), /at least 900px/);
  await assert.rejects(describe("miso-soup", { file: "File:Soup.jpg", alt: "x" }, reply("CC BY 4.0", 4000, "")), /no author/);
  await assert.rejects(describe("miso-soup", { file: "Soup.jpg", alt: "x" }, reply("CC BY 4.0")), /Commons file title/);
});

test("photos in use are registered as a live source", () => {
  const used = Object.keys(photos).length;
  assert.equal(getSource("recipe-photos").status, used ? "live" : "planned");
  for (const slug of Object.keys(photos)) assert.ok(bySlug.has(slug), `photo for unknown recipe ${slug}`);
});

test("facet ids are unique and every recipe uses known values", () => {
  for (const facet of FACETS) assert.equal(new Set(facet.values.map(v => v.id)).size, facet.values.length, facet.id);
});
