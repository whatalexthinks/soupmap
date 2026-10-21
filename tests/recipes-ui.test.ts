import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { loadJournal } from "../src/journal/load.ts";
import { loadRecipes } from "../src/recipes/load.ts";
import { recipePages, recipesDocument } from "../src/render/recipes.ts";
import { setupBrowse, type Ratings } from "../src/recipes/browse.ts";
import { setupRecipe } from "../src/recipes/cook.ts";
import { ReviewsSection, type ReviewsResponse } from "../src/recipes/reviews.ts";

const recipes = loadRecipes(new Set(loadJournal().map(a => a.slug)));
const pages = new Map(recipePages(recipes).map(p => [p.path, p]));
const bySlug = new Map(recipes.map(r => [r.slug, r]));

let window: Window | undefined;
afterEach(async () => { await window?.happyDOM.abort(); await window?.happyDOM.close(); window = undefined; });

function open(path: string, search = "") {
  window = new Window({ url: `https://soupmap.example${path}${search}` });
  window.document.write(recipesDocument(pages.get(path)!, "https://soupmap.example", recipes, { styles: [], scripts: [] }));
  for (const key of ["document", "location", "history", "localStorage", "sessionStorage", "navigator", "HTMLElement", "HTMLInputElement",
    "HTMLSelectElement", "HTMLFormElement", "FormData", "IntersectionObserver", "CSS"]) {
    Object.defineProperty(globalThis, key, { value: (window as unknown as Record<string, unknown>)[key], configurable: true });
  }
  Object.defineProperty(globalThis, "window", { value: window, configurable: true });
  const doc = window.document as unknown as Document;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) => doc.querySelector<T>(selector)!;
  const visible = () => [...doc.querySelectorAll<HTMLElement>("#r-grid .r-card")].filter(c => !c.hidden).map(c => c.dataset.slug!);
  return { doc, $, visible };
}
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

test("the index filters, searches and sorts, and keeps the view in the address", async () => {
  const { doc, $, visible } = open("/recipes/");
  setupBrowse(doc, Promise.resolve(null));
  assert.equal($("#r-controls").hidden, false);
  assert.equal(visible().length, recipes.length);

  const region = $<HTMLSelectElement>("select[name=region]");
  region.value = "japan";
  region.dispatchEvent(new window!.Event("change", { bubbles: true }) as unknown as Event);
  assert.ok(visible().length > 5 && visible().every(slug => bySlug.get(slug)!.region === "japan"));
  assert.equal(new URL(doc.location.href).searchParams.get("region"), "japan");
  assert.match($("#r-count").textContent!, /of \d+ recipes/);

  const sort = $<HTMLSelectElement>("select[name=sort]");
  sort.value = "quick";
  sort.dispatchEvent(new window!.Event("change", { bubbles: true }) as unknown as Event);
  const totals = visible().map(slug => bySlug.get(slug)!.total);
  assert.deepEqual(totals, [...totals].sort((a, b) => a - b));

  const search = $<HTMLInputElement>("input[name=q]");
  search.value = "zzzz no such soup";
  search.dispatchEvent(new window!.Event("input", { bubbles: true }) as unknown as Event);
  assert.equal(visible().length, 0);
  assert.equal($("#r-empty").hidden, false);
  ($("[data-action=clear-filters]") as HTMLButtonElement).click();
  assert.equal(visible().length, recipes.length);
  assert.equal(new URL(doc.location.href).search, "");
});

test("a shared filtered link opens filtered, and top-rated sorting uses live ratings", async () => {
  const vegan = recipes.filter(r => r.diet.includes("vegan")).map(r => r.slug);
  const { doc, visible } = open("/recipes/", "?diet=vegan&sort=az");
  setupBrowse(doc, Promise.resolve(null));
  assert.deepEqual(visible(), [...vegan].sort((a, b) => bySlug.get(a)!.title.toLowerCase().localeCompare(bySlug.get(b)!.title.toLowerCase())));

  const { doc: doc2, visible: visible2 } = open("/recipes/", "?sort=rated");
  const [low, high] = [recipes[3]!.slug, recipes[7]!.slug];
  const ratings: Ratings = { [low]: { average: 3.2, count: 10 }, [high]: { average: 4.9, count: 4 } };
  setupBrowse(doc2, Promise.resolve(ratings));
  await tick();
  assert.deepEqual(visible2().slice(0, 2), [high, low]);
});

test("a browse page hides its own filter", () => {
  const { doc, $ } = open("/recipes/region/europe/");
  setupBrowse(doc, Promise.resolve(null));
  assert.ok($("select[name=region]").closest("label")!.hasAttribute("hidden"));
  assert.ok(!$("select[name=diet]").closest("label")!.hasAttribute("hidden"));
});

test("on a recipe: scale servings, switch units, run a timer, save, keep notes and cook step by step", async () => {
  const recipe = recipes.find(r => r.slug === "miso-soup")!;
  const { doc, $ } = open(`/recipes/${recipe.slug}/`);
  setupRecipe(doc);
  const amounts = () => [...doc.querySelectorAll(".r-ingredients .r-qty")].map(el => el.textContent);
  const before = amounts();
  ($("[data-action=more]") as HTMLButtonElement).click();
  assert.equal($("#r-serves").textContent, String(recipe.serves + 1));
  assert.notDeepEqual(amounts(), before);
  assert.equal($("#r-scale-note").hidden, false);
  ($("[data-action=fewer]") as HTMLButtonElement).click();
  assert.deepEqual(amounts(), before);
  ($('[data-units="us"]') as HTMLButtonElement).click();
  assert.ok(amounts().some(a => /cups?|oz|lb|qt|in\b/.test(a!)), "US units shown");
  assert.equal(window!.localStorage.getItem("soupmap:recipes:units:v1"), '"us"');

  // Times in the method become timer buttons.
  const timer = $("button.r-timer");
  assert.ok(timer, "a timer button exists");
  timer.click();
  const tray = doc.querySelector<HTMLElement>(".r-timers")!;
  assert.equal(tray.hidden, false);
  assert.match(tray.textContent!, /Step \d+/);
  (tray.querySelector("[data-op=clear]") as HTMLButtonElement).click();
  assert.equal(tray.hidden, true);

  ($("[data-action=save]") as HTMLButtonElement).click();
  assert.deepEqual(JSON.parse(window!.localStorage.getItem("soupmap:recipes:saved:v1")!), [recipe.slug]);
  assert.equal($("[data-action=save]").getAttribute("aria-pressed"), "true");

  const notes = $<HTMLTextAreaElement>("#r-notes-text");
  assert.equal($("#r-notes").hidden, false);
  notes.value = "Used white miso. Less next time.";
  notes.dispatchEvent(new window!.Event("input", { bubbles: true }) as unknown as Event);
  await tick(450);
  assert.equal(JSON.parse(window!.localStorage.getItem("soupmap:recipes:notes:v1")!)[recipe.slug], "Used white miso. Less next time.");

  // Ingredient ticks last for this tab.
  ($(".r-ing__check") as HTMLInputElement).click();
  assert.deepEqual(JSON.parse(window!.sessionStorage.getItem(`soupmap:recipes:checks:${recipe.slug}`)!), [0]);

  ($("[data-action=cook]") as HTMLButtonElement).click();
  await tick();
  const cook = $("#r-cook");
  assert.equal(cook.hidden, false);
  assert.match(cook.textContent!, new RegExp(`Step 1 of ${recipe.stepCount}`));
  (cook.querySelector("[data-cook=next]") as HTMLButtonElement).click();
  assert.match(cook.textContent!, new RegExp(`Step 2 of ${recipe.stepCount}`));
  (cook.querySelector("[data-cook=close]") as HTMLButtonElement).click();
  assert.equal(cook.hidden, true);
});

function reviewsApi(response: ReviewsResponse, calls: { url: string; method: string; body?: unknown }[] = []): typeof fetch {
  return (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return new Response(JSON.stringify(init.method && init.method !== "GET" ? { ok: true } : response), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}
const EMPTY = { average: null, count: 0, stars: [0, 0, 0, 0, 0], madeIt: 0, tips: 0 };

test("reviews: guests are invited to sign in and come back; nobody can inject markup", async () => {
  const { doc, $ } = open("/recipes/tonjiru/");
  const evil = { id: "11111111-1111-4111-8111-111111111111", name: "<img src=x onerror=alert(1)>", rating: 4, body: "<script>alert(1)</script>\n\nSecond paragraph",
    madeIt: true, tip: "<b>bold</b> trick", tipKind: "technique" as const, created: "2026-10-20T10:00:00Z", updated: "2026-10-20T10:00:00Z",
    status: "published" as const, helpful: 3, mine: false, voted: false };
  const section = new ReviewsSection($("#reviews"), "tonjiru", reviewsApi({ summary: { average: 4, count: 1, stars: [0, 0, 0, 1, 0], madeIt: 1, tips: 1 },
    reviews: [evil], viewer: { signedIn: false, moderator: false } }));
  await section.load();
  const body = $("#r-reviews-body");
  assert.equal(body.querySelector("img, script, b"), null, "reader text is escaped");
  assert.match(body.textContent!, /<img src=x onerror=alert\(1\)>/);
  assert.match(body.textContent!, /Tips from cooks/);
  const signIn = body.querySelector<HTMLAnchorElement>('a[href^="/sign-in"]')!;
  assert.equal(new URL(signIn.href).searchParams.get("redirect_url"), "/recipes/tonjiru/#reviews");
  assert.equal(body.querySelector("form"), null, "no form for guests");
  assert.equal(body.querySelector("[data-review=helpful]"), null, "guests can't vote");
});

test("reviews: signed in, post a rating with a tip; the form checks before sending", async () => {
  const { $ } = open("/recipes/tonjiru/");
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const section = new ReviewsSection($("#reviews"), "tonjiru", reviewsApi({ summary: EMPTY, reviews: [], viewer: { signedIn: true, moderator: false } }, calls));
  await section.load();
  const form = $("#r-reviews-body").querySelector<HTMLFormElement>("form[data-form=review]")!;
  assert.ok(form);
  assert.match($("#r-reviews-body").textContent!, /No reviews yet/);
  // Nothing chosen: the form says so and sends nothing.
  form.requestSubmit();
  await tick();
  assert.equal(calls.filter(c => c.method === "PUT").length, 0);
  assert.match($("#r-reviews-body").textContent!, /Add a star rating, a tip, or both/);

  const again = $("#r-reviews-body").querySelector<HTMLFormElement>("form[data-form=review]")!;
  (again.querySelector('input[name=rating][value="5"]') as HTMLInputElement).checked = true;
  (again.querySelector("textarea[name=tip]") as HTMLTextAreaElement).value = "Fry the pork until it browns.";
  (again.querySelector("select[name=tipKind]") as HTMLSelectElement).value = "technique";
  (again.querySelector("input[name=madeIt]") as HTMLInputElement).checked = true;
  (again.querySelector("input[name=name]") as HTMLInputElement).value = "Aki";
  again.requestSubmit();
  await tick(20);
  const put = calls.find(c => c.method === "PUT")!;
  assert.equal(put.url, "/api/recipes/tonjiru/review");
  assert.deepEqual(put.body, { rating: 5, tip: "Fry the pork until it browns.", tipKind: "technique", body: "", madeIt: true, name: "Aki" });
});

test("reviews: an unavailable service leaves the recipe alone", async () => {
  const { $ } = open("/recipes/tonjiru/");
  const html = (async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
  const section = new ReviewsSection($("#reviews"), "tonjiru", html);
  await section.load();
  assert.match($("#r-reviews-body").textContent!, /aren't available right now/);
});
