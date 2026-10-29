import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { Window } from "happy-dom";
import { CURATED_SHOPS, ORDERED_SHOPS } from "../src/data/shops.ts";
import { buildGuides } from "../src/guides/model.ts";
import { guidesByShop } from "../src/render/guides.ts";
import { catalogPages, restaurantDescription, restaurantTitle } from "../src/render/catalog.ts";
import { profileHtml } from "../src/render/directory.ts";
import { affiliateModule, weatherWidget } from "../src/growth/render.ts";
import { assessPages } from "../src/seo/quality.ts";
import { catalogQuality } from "../src/seo/site.ts";
import { displayName } from "../src/names.ts";
import { growthPublicApi } from "../server/growth-api.ts";
import { WeatherService } from "../server/weather.ts";
import type { GrowthStore } from "../server/growth-store.ts";
import { optionalAuth } from "../server/middlewares/optionalAuth.ts";

const guideLinks = guidesByShop(buildGuides(ORDERED_SHOPS));
const restaurants = catalogPages(ORDERED_SHOPS, guideLinks).filter(page => /^\/catalog\/[^/]+\/$/.test(page.path) && page.content.includes("data-place-profile"));

test("restaurant pages: what a visitor came for first, then the guides that list it", () => {
  const page = restaurants.find(p => p.path === "/catalog/yoshimuraya-yokohama/")!;
  const at = (marker: string) => page.content.indexOf(marker);
  assert.ok(at("place-profile__facts") < at("growth-map-banner") && at("place-profile__columns") < at("growth-map-banner"), "facts and notes before the map banner");
  assert.ok(at("place-guides") > at("place-profile__columns"), "guides follow the notes");
  assert.match(page.content, /href="\/guides\/iekei-ramen-in-yokohama\/">Iekei ramen in Yokohama<\/a>/);
  assert.match(page.content, /href="\/guides\/city\/yokohama\/">Every guide for Yokohama<\/a>/);
  // Most specific guide first.
  const listed = [...page.content.matchAll(/<li><a href="(\/guides\/[^"]+)"/g)].map(m => m[1]);
  assert.equal(listed[0], "/guides/iekei-ramen-in-yokohama/");
  // One "cook it at home" box: the specific recipe, not also the generic one.
  assert.equal((page.content.match(/class="place-recipe"/g) ?? []).length, 1);
  assert.doesNotMatch(page.content, /growth-home/);
  assert.equal(affiliateModule("ramen", false), "", "no products and a recipe already shown: nothing");
  assert.match(affiliateModule("ramen"), /Find a soup to make tonight/, "no recipe on the page: point to the recipes");
  assert.doesNotMatch(page.content, /SoupMap/);
  // Every selection with an indexable guide links back to one.
  const withGuides = CURATED_SHOPS.filter(shop => guideLinks.get(shop.slug)?.length);
  assert.ok(withGuides.length >= 25, `${withGuides.length} selections link to their guides`);
  // The pop-up profile in the catalog has no guide data and renders without the section.
  assert.doesNotMatch(profileHtml(CURATED_SHOPS[0]!), /place-guides/);
});

test("restaurant snippets lead with our notes; titles name the bowl and stay short", () => {
  const shop = CURATED_SHOPS.find(s => s.slug === "yoshimuraya-yokohama")!;
  assert.equal(restaurantTitle(shop, displayName(shop, "en")), "Yoshimuraya — Iekei ramen in Okano, Yokohama · Soupmap");
  const keika = CURATED_SHOPS.find(s => s.slug === "keika-kumamoto")!;
  assert.doesNotMatch(restaurantTitle(keika, displayName(keika, "en")), /\(/, "parentheticals stay out of titles");
  assert.ok(restaurantDescription(shop, "Yoshimuraya").startsWith("Yoshimuraya (吉村家) in Okano, Yokohama. Where iekei began"));
  for (const page of restaurants) {
    assert.ok(page.title.length <= 72, `${page.path}: title ${page.title.length} chars`);
    assert.doesNotMatch(page.description, /Unverified location/, `${page.path}: the disclaimer belongs on the page`);
    assert.match(page.content, /Not verified|Verified on the ground/, `${page.path}: and it is still there`);
  }
  const verdicts = assessPages(restaurants.map(catalogQuality));
  for (const page of restaurants) assert.equal(verdicts.get(page.path)!.indexable, true, `${page.path}: ${verdicts.get(page.path)!.reasons.join("; ")}`);
});

test("weather: without a commercial key production says 'nothing to show', not 'try again'", async () => {
  const app = express();
  const weather = new WeatherService((async () => { throw new Error("no network in tests"); }) as typeof fetch);
  app.use("/api/growth", growthPublicApi({} as GrowthStore, weather, async () => false));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  const env = { node: process.env.NODE_ENV, key: process.env.OPEN_METEO_API_KEY };
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/growth/weather?lat=35.7&lng=139.8`;
    process.env.NODE_ENV = "production"; delete process.env.OPEN_METEO_API_KEY;
    const off = await fetch(url);
    assert.equal(off.status, 204);
    assert.match(off.headers.get("cache-control") ?? "", /max-age=3600/);
    process.env.OPEN_METEO_API_KEY = "test-key";
    assert.equal((await fetch(url)).status, 503, "configured but failing: an outage, so Retry");
  } finally {
    process.env.NODE_ENV = env.node; if (env.key === undefined) delete process.env.OPEN_METEO_API_KEY; else process.env.OPEN_METEO_API_KEY = env.key;
    await new Promise<void>(r => server.close(() => r()));
  }
});

test("an identity provider that fails leaves requests signed out, never broken", async () => {
  const run = async (middleware: express.RequestHandler) => {
    const errors: unknown[] = [];
    const app = express();
    app.use(optionalAuth(middleware, error => errors.push(error)));
    app.get("/", (_req, res) => { res.json({ ok: true }); });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(r => server.once("listening", r));
    try {
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
      const statuses = [(await fetch(url)).status, (await fetch(url)).status];
      return { statuses, errors };
    } finally { await new Promise<void>(r => server.close(() => r())); }
  };
  const viaNext = await run((_req, _res, next) => next(new Error("Publishable key is missing")));
  assert.deepEqual(viaNext.statuses, [200, 200]);
  assert.equal(viaNext.errors.length, 1, "reported once, not on every request");
  assert.deepEqual((await run(() => { throw new Error("sync"); })).statuses, [200, 200]);
  assert.deepEqual((await run(async () => { throw new Error("async"); })).statuses, [200, 200]);
  const fine = await run((_req, _res, next) => next());
  assert.deepEqual([fine.statuses, fine.errors.length], [[200, 200], 0]);
  // A middleware that answers the request itself still ends it there.
  assert.deepEqual((await run((_req, res) => { res.status(401).end(); })).statuses, [401, 401]);
});

test("catalog pages before the directory loads: Save shows this device's saves, no weather box, no passport call for guests", async () => {
  const shop = CURATED_SHOPS[0]!;
  const window = new Window({ url: `https://soupmap.com/catalog/${shop.slug}/` });
  window.localStorage.setItem("soupmap:saved:v1", JSON.stringify([shop.slug]));
  window.document.write(`<main>${profileHtml(shop)}<p data-directory-status></p></main>`);
  const keys = ["window", "document", "location", "navigator", "localStorage", "sessionStorage", "HTMLElement", "Element", "HTMLButtonElement", "CSS"];
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? window : (window as unknown as Record<string, unknown>)[key] });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const path = String(input); calls.push(path);
    if (path.includes("/weather")) return new Response(null, { status: 204 });
    return Response.json({ error: "Sign in" }, { status: 401 });
  }) as typeof fetch;
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  try {
    assert.equal(window.document.querySelector<HTMLButtonElement>("[data-directory-save]")!.hidden, true, "rendered hidden for no-JS readers");
    await import("../src/catalog-entry.ts"); await tick();
    const save = window.document.querySelector<HTMLButtonElement>(".place-profile__actions [data-directory-save]")!;
    assert.equal(save.hidden, false);
    assert.equal(save.textContent, "Saved ✓");
    assert.equal(save.getAttribute("aria-pressed"), "true");
    // happy-dom has no IntersectionObserver, so the widget loads at once.
    assert.equal(window.document.querySelector(".growth-weather"), null, "no weather service: no empty box");
    window.document.dispatchEvent(new window.Event("pointerdown", { bubbles: true })); await tick();
    assert.equal(calls.filter(c => c.includes("/api/passport")).length, 0, "guests are not asked for stamps");
    assert.ok(weatherWidget(shop).includes("data-weather-lat"));
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key]; }
    await window.happyDOM.close();
  }
});
