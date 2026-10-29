import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { kanaToRomaji, placeName } from "../scripts/lib/kana.ts";
import { parseLocalGov, stem } from "../scripts/build-municipalities.ts";
import { MUNICIPALITIES, municipalityByCode, municipalityOf } from "../src/data/municipalities.ts";
import { CURATED_SHOPS, OPEN_SHOPS, ORDERED_SHOPS, type Shop } from "../src/data/shops.ts";
import { CITIES } from "../src/data/cities.ts";
import { isIndexableShop } from "../src/data/indexation.ts";
import { buildGuides, guidePlace, matchesStyle, GUIDE_STYLES, type Guide } from "../src/guides/model.ts";
import { parseGuideIntro, validateGuideIntros } from "../src/guides/intros.ts";
import { loadGuideIntros } from "../src/guides/load-intros.ts";
import { guideSite, indexEligible, plannerArea, STYLE_ESSAYS } from "../src/render/guides.ts";
import { catalogDocument } from "../src/render/catalog.ts";
import { cardSvg, wrap } from "../src/seo/cards.ts";
import { guideCardPath, recipeCardPath } from "../src/seo/share.ts";
import { stylesHtml } from "../src/ui/shop-details.ts";
import { RECIPE_LINKS, recipeForShop, recipeForStyle } from "../src/recipes/catalog-links.ts";
import { placesForRecipe, PLACES_SHOWN } from "../src/recipes/places.ts";
import { affiliateConfig, buyLink } from "../src/recipes/pantry.ts";
import { checkCost, checkNutrition, loadRecipes } from "../src/recipes/load.ts";
import { loadJournal } from "../src/journal/load.ts";
import { recipeDetailPage, recipesHead } from "../src/render/recipes.ts";
import { profileHtml } from "../src/render/directory.ts";
import { assessPages, robotsFor, structuredAttributes, type QualityInput } from "../src/seo/quality.ts";
import { sitemapFiles, type SitemapEntry } from "../src/seo/site.ts";
import { withRating } from "../server/recipe-pages.ts";
import { indexNowApi, indexNowConfig, keyFile, submitChanged, submitUrls, type SitemapUrl, type SubmissionLog } from "../server/indexnow.ts";

const articles = loadJournal();
const recipes = loadRecipes(new Set(articles.map(a => a.slug)));
const recipeBySlug = new Map(recipes.map(r => [r.slug, r]));
const guides = buildGuides(ORDERED_SHOPS);

test("kana readings become Hepburn place names, so 久留米 is Kurume", () => {
  const cases: [string, string][] = [["くるめ", "Kurume"], ["ちゃたん", "Chatan"], ["とうおん", "Toon"], ["おおづ", "Ozu"], ["きょうと", "Kyoto"],
    ["とうきょう", "Tokyo"], ["さっぽろ", "Sapporo"], ["にいがた", "Niigata"], ["ちゅうおう", "Chuo"], ["はっちょう", "Hatcho"], ["しゅうなん", "Shunan"], ["さんむ", "Sanmu"]];
  for (const [kana, name] of cases) assert.equal(placeName(kana), name, kana);
  assert.equal(kanaToRomaji("ヨコハマ"), "yokohama", "katakana folds to hiragana");
  assert.throws(() => kanaToRomaji("横浜"), /Unexpected character/);
  assert.equal(stem("久留米市", "くるめし"), "くるめ");
  assert.equal(stem("大津町", "おおづまち"), "おおづ");
  assert.throws(() => stem("大津町", "おおづ"), /Can't find/);
  const rows = parseLocalGov(`﻿pid,pref,cid,city,citykana,lat,lng,url,phrase,lgcode
40,福岡県,40130,福岡市,ふくおかし,33.59,130.40,https://x,Hello, world,401307
40,福岡県,40133,福岡市 中央区,ふくおかし ちゅうおうく,33.58,130.39,https://x,,401331
12,千葉県,12218,勝浦市,かつうらし,35.15,140.32,https://x,,122181`);
  assert.deepEqual(rows, [["40130", 40, "福岡市", "Fukuoka", "city", 33.59, 130.4], ["40133", 40, "福岡市中央区", "Chuo", "ward", 33.58, 130.39, "40130"],
    ["12218", 12, "勝浦市", "Katsuura", "city", 35.15, 140.32]], "katsu + ura stays Katsuura: a checked override");
});

test("shops are placed in real municipalities, with unique, stable guide slugs", () => {
  assert.ok(MUNICIPALITIES.length > 1800 && new Set(MUNICIPALITIES.map(m => m.code)).size === MUNICIPALITIES.length);
  const at = (neighborhood: string, prefecture?: string) => municipalityOf({ cityCode: "00000", neighborhood, prefecture });
  assert.deepEqual([at("札幌市中央区", "Hokkaido")?.city.name, at("札幌市中央区", "Hokkaido")?.ward?.name], ["Sapporo", "Chuo"]);
  assert.equal(at("河内郡上三川町", "Tochigi")?.city.name, "Kaminokawa", "the 郡 district is dropped");
  assert.equal(at("浜松市中央区", "Shizuoka")?.city.name, "Hamamatsu", "a ward renamed since the source still places the city");
  assert.equal(at("Yokohama", "Kanagawa")?.city.name, "Yokohama", "English locality names are matched too");
  assert.equal(at("府中市"), undefined, "a name two prefectures share needs the prefecture");
  assert.equal(at("府中市", "Tokyo")?.city.prefecture, 13);
  const matched = ORDERED_SHOPS.filter(shop => municipalityOf(shop)).length;
  assert.ok(matched / ORDERED_SHOPS.length > 0.98, `${matched} of ${ORDERED_SHOPS.length} shops placed`);

  const places = MUNICIPALITIES.filter(m => m.kind !== "ward").map(guidePlace);
  assert.equal(new Set(places.map(p => p.slug)).size, places.length, "every municipality has its own slug");
  const slug = (nameJa: string, prefecture: number) => guidePlace(MUNICIPALITIES.find(m => m.nameJa === nameJa && m.prefecture === prefecture)!).slug;
  assert.equal(slug("横浜市", 14), "yokohama", "the designated city keeps the bare name over 横浜町");
  assert.equal(slug("中央区", 13), "chuo", "Tokyo's Chuo ward over 中央市");
  assert.equal(slug("府中市", 13), "fuchu-tokyo");
  assert.equal(slug("府中町", 34), "fuchu-town-hiroshima");
});

test("guides: every listed place matches the style, paths are unique, home cities are marked", () => {
  assert.ok(guides.length > 1500);
  assert.equal(new Set(guides.map(g => g.path)).size, guides.length);
  for (const guide of guides) {
    assert.ok(guide.shops.length >= 3, guide.path);
    assert.ok(guide.shops.every(shop => matchesStyle(shop, guide.style) && municipalityOf(shop)?.city.code === guide.place.municipality.code), guide.path);
    assert.equal(guide.independents, guide.shops.filter(s => !s.chain).length);
  }
  const home = guides.find(g => g.path === "/guides/hakata-ramen-in-fukuoka/")!;
  assert.ok(home.home && !guides.find(g => g.path === "/guides/hakata-ramen-in-osaka/")?.home);
  // Soupmap selections come first in a guide.
  const withSelection = guides.find(g => g.shops.some(s => !s.slug.startsWith("open-")) && g.shops.some(s => s.slug.startsWith("open-")))!;
  assert.ok(!withSelection.shops[0]!.slug.startsWith("open-"));
});

test("guide pages: honest names in snippets, thin ones marked for noindex, hubs need two real guides", () => {
  const pages = guideSite(guides, { articles: new Map(articles.map(a => [a.slug, a.title])), lastmod: "2026-10-18" });
  const verdicts = assessPages(pages.map(p => p.quality));
  const guidePages = pages.filter(p => p.quality.kind === "guide");
  for (const page of guidePages) {
    const guide = guides.find(g => g.path === page.path)!;
    assert.equal(verdicts.get(page.path)!.indexable, indexEligible(guide), page.path);
  }
  const page = pages.find(p => p.path === "/guides/miso-ramen-in-sapporo/")!;
  assert.match(page.title, /^Miso ramen in Sapporo, Hokkaido · \d+ places · Soupmap$/);
  assert.match(page.content, /href="\/recipes\/miso-ramen\/"/, "links to the recipe");
  assert.match(page.content, /href="\/map\/#shortlist=v1&amp;id=/, "and to the places on the map");
  assert.ok(page.description.length <= 320);
  // Snippets cite a source or editorial name, or the Japanese, never a machine reading.
  const romanizedOnly = ORDERED_SHOPS.filter(s => s.slug.startsWith("open-") && /[\p{Script=Han}\p{Script=Katakana}]/u.test(s.name) && s.nameRomanized);
  for (const shop of romanizedOnly.slice(0, 2000)) assert.ok(!page.description.includes(shop.nameRomanized!) || page.description.includes(shop.nameJa));
  for (const hub of pages.filter(p => p.quality.kind === "hub")) assert.equal(verdicts.get(hub.path)!.indexable, (hub.quality.items ?? 0) >= 2, hub.path);
  for (const slugs of Object.values(STYLE_ESSAYS)) for (const slug of slugs) assert.ok(articles.some(a => a.slug === slug), `journal essay ${slug}`);
});

test("recipes and catalog link both ways through one checked table", () => {
  for (const link of RECIPE_LINKS) {
    const recipe = recipeBySlug.get(link.recipe);
    assert.ok(recipe, link.recipe);
    assert.equal(link.title, recipe.title);
    assert.equal(link.mark, recipe.mark);
    for (const style of link.styles) assert.ok(GUIDE_STYLES.some(s => s.id === style), style);
  }
  const shop = (over: Partial<Shop>): Shop => ({ ...ORDERED_SHOPS.find(s => s.slug.startsWith("open-"))!, styles: undefined, ...over });
  assert.equal(recipeForShop(shop({ name: "博多ラーメン", nameJa: "博多ラーメン", cuisine: "ramen", broth: "tonkotsu", styles: ["hakata", "tonkotsu"] }))?.link.recipe, "tonkotsu-ramen");
  assert.equal(recipeForShop(shop({ name: "カレーうどん千吉", nameJa: "カレーうどん千吉", cuisine: "udon", broth: "udon" }))?.heading, "Make curry udon at home");
  const udon = recipeForShop(shop({ name: "讃岐うどん", nameJa: "讃岐うどん", cuisine: "udon", broth: "udon" }))!;
  assert.deepEqual([udon.link.recipe, udon.heading], ["kitsune-udon", "Make udon at home"], "a plain udon shop isn't promised kitsune udon");
  assert.equal(recipeForShop(shop({ name: "そば処", nameJa: "そば処", cuisine: "soba", broth: "soba" }))?.link.recipe, "kake-soba");
  assert.equal(recipeForShop(shop({ name: "Cafe", nameJa: "カフェ", cuisine: "other", broth: "other" })), undefined);
  assert.equal(recipeForStyle("chuka-soba")?.recipe, "shoyu-ramen");
  // The card is on every shop profile that has a match: static shop pages and the dialog share it.
  const curated = ORDERED_SHOPS.find(s => !s.slug.startsWith("open-") && recipeForShop(s))!;
  assert.match(profileHtml(curated), new RegExp(`class="place-recipe"[\\s\\S]*href="/recipes/${recipeForShop(curated)!.link.recipe}/"`));
});

test("'Don't feel like cooking?' picks independents across cities, from indexable guides", () => {
  const places = placesForRecipe("miso-ramen", guides, indexEligible)!;
  assert.ok(places.picks.length > 2 && places.picks.length <= PLACES_SHOWN);
  assert.ok(places.picks.every(({ shop, guide }) => !shop.chain && indexEligible(guide) && guide.shops.includes(shop)));
  const perCity = new Map<string, number>();
  for (const { guide } of places.picks) perCity.set(guide.place.municipality.code, (perCity.get(guide.place.municipality.code) ?? 0) + 1);
  assert.ok([...perCity.values()].every(n => n <= 2));
  assert.equal(places.guides[0]!.home, true, "the style's home city leads");
  assert.equal(placesForRecipe("borscht", guides, indexEligible), undefined);
  const page = recipeDetailPage(recipeBySlug.get("miso-ramen")!, recipes, { places: new Map([["miso-ramen", places]]) });
  assert.match(page.main, /Don't feel like cooking\?[\s\S]*Places serving miso ramen in Japan/);
  for (const { shop } of places.picks) assert.ok(page.main.includes(`href="/map/#${shop.slug}"`));
  const udon = placesForRecipe("kitsune-udon", guides, indexEligible)!;
  assert.match(recipeDetailPage(recipeBySlug.get("kitsune-udon")!, recipes, { places: new Map([["kitsune-udon", udon]]) }).main, /Places serving udon in Japan/);
});

test("ingredient buy links appear only when configured, marked sponsored, with the disclosure", () => {
  assert.equal(affiliateConfig({}), undefined);
  assert.throws(() => affiliateConfig({ VITE_AMAZON_ASSOCIATES_TAG: "not a tag!" }), /Associates/);
  assert.throws(() => affiliateConfig({ VITE_INSTACART_LINK_TEMPLATE: "http://x.example/?q=" }), /\{query\}/);
  const amazon = affiliateConfig({ VITE_AMAZON_ASSOCIATES_TAG: "soupmap-20" })!;
  assert.equal(buyLink("10 g kombu", undefined), undefined);
  assert.equal(buyLink("2 onions", amazon), undefined, "everyday ingredients get no link");
  assert.equal(buyLink("10 g kombu", amazon)!.href, "https://www.amazon.com/s?k=kombu+dried+kelp&tag=soupmap-20");
  const both = affiliateConfig({ VITE_AMAZON_ASSOCIATES_TAG: "soupmap-20", VITE_INSTACART_LINK_TEMPLATE: "https://www.instacart.com/store/s?k={query}" })!;
  assert.equal(buyLink("200 g konnyaku", both)!.shop, "Instacart", "fresh things come from a grocery delivery");
  assert.equal(buyLink("2 tbsp white miso", both)!.shop, "Amazon");
  const page = recipeDetailPage(recipeBySlug.get("miso-soup")!, recipes, { affiliate: amazon });
  const links = [...page.main.matchAll(/<a class="r-buy" href="([^"]+)" rel="sponsored nofollow noopener"/g)].map(m => m[1]!);
  assert.ok(links.length >= 2 && links.every(href => href.includes("tag=soupmap-20")));
  assert.equal(new Set(links).size, links.length, "one link per item");
  assert.match(page.main, /As an Amazon Associate, Soupmap earns from qualifying purchases/);
});

test("cost per bowl and nutrition need a named source; none are shown without one", () => {
  assert.ok(recipes.every(r => !r.cost && !r.nutrition), "no sourced data yet, so nothing is shown");
  assert.deepEqual(checkCost("x", { currency: "USD", home: 3.5, out: 17, source: "USDA price data and a menu survey", checked: "2026-10" }).home, 3.5);
  assert.throws(() => checkCost("x", { currency: "USD", home: 3.5, out: 17, checked: "2026-10" }), /source/);
  assert.throws(() => checkNutrition("x", { calories: 500, protein: 30, sodium: 1800 }), /source/);
  const recipe = { ...recipeBySlug.get("shoyu-ramen")!, cost: { currency: "USD" as const, home: 3.5, out: 17, source: "Test prices, illustrative", checked: "2026-10" } };
  assert.match(recipeDetailPage(recipe, recipes).main, /<strong>\$3\.50<\/strong> a bowl at home[\s\S]*about \$17<\/strong> eating out/);
});

test("the quality gate: unique descriptions, eight attributes, real places, enough content", () => {
  const entity = { name: "A", description: "B", url: "/a/", about: {}, inLanguage: "en", isPartOf: { name: "S" }, breadcrumb: { x: 1 }, keywords: "k", dateModified: "2026", mainEntity: { a: 1 } };
  assert.equal(structuredAttributes({ "@context": "x", "@type": "Recipe", name: "A", empty: "", list: [], obj: {}, n: 0 }), 2);
  const base = (over: Partial<QualityInput>): QualityInput => ({ path: "/p/", kind: "guide", title: "T", description: "A description that is long enough to be a real summary of the page.", data: entity, items: 9, independents: 5, places: [{ lat: 35, lng: 139 }], ...over });
  const v = assessPages([
    base({ path: "/ok/", title: "One" }),
    base({ path: "/dup-a/", title: "Two", description: "The same words on two different pages, which is not allowed here at all." }),
    base({ path: "/dup-b/", title: "Three", description: "The same words on two different pages, which is not allowed here at all." }),
    base({ path: "/thin/", title: "Four", description: "A guide with too few places in it to be worth indexing on its own.", items: 4 }),
    base({ path: "/chains/", title: "Five", description: "A guide that is mostly chain locations, with few independents to show.", independents: 2 }),
    base({ path: "/sea/", title: "Six", description: "A guide where one of the places sits in the middle of the ocean, oddly.", places: [{ lat: 0, lng: 0 }] }),
    base({ path: "/sparse/", title: "Seven", description: "A recipe page whose structured data is missing most of its attributes.", kind: "recipe", data: { name: "x" }, ingredients: 5, steps: 5 }),
    base({ path: "/boiler/", title: "Eight", kind: "shop", description: "Listed in Overture's open places catalog. Menu not verified, so check first." }),
    base({ path: "/hub/", title: "Nine", kind: "hub", description: "A hub page that links to just one indexable guide and nothing more.", items: 1 }),
  ]);
  assert.equal(v.get("/ok/")!.indexable, true);
  assert.match(v.get("/dup-a/")!.reasons.join(), /shared with \/dup-b\//);
  assert.match(v.get("/thin/")!.reasons.join(), /4 places \(want 5\+\)/);
  assert.match(v.get("/chains/")!.reasons.join(), /2 independent places/);
  assert.match(v.get("/sea/")!.reasons.join(), /coordinates/);
  assert.match(v.get("/sparse/")!.reasons.join(), /1 structured attributes \(want 8\+\)/);
  assert.match(v.get("/boiler/")!.reasons.join(), /boilerplate/);
  assert.match(v.get("/hub/")!.reasons.join(), /1 indexable guides/);
  assert.equal(robotsFor(v.get("/thin/")), "noindex,follow");
  assert.equal(robotsFor(v.get("/ok/")), "index,follow");
});

test("sitemaps: rejected pages left out, duplicates dropped, big segments split", () => {
  const entries = (prefix: string, n: number): SitemapEntry[] => Array.from({ length: n }, (_, i) => ({ path: `/${prefix}/${i}/`, lastmod: `2026-10-${String(10 + (i % 9)).padStart(2, "0")}` }));
  const verdicts = new Map([["/cities/1/", { indexable: false, reasons: ["thin"] }]]);
  const files = sitemapFiles({ pages: [{ path: "/" }], journal: [], recipes: entries("recipes", 3), catalog: [...entries("catalog", 5), { path: "/" }], cities: entries("cities", 4) }, verdicts, "https://s.example", 3);
  assert.deepEqual(files.map(f => [f.file, f.count]), [["sitemap-pages.xml", 1], ["sitemap-recipes.xml", 3], ["sitemap-catalog-1.xml", 3], ["sitemap-catalog-2.xml", 2], ["sitemap-cities.xml", 3]], "the rejected guide leaves three: one file");
  assert.ok(!files.some(f => f.source.includes("/cities/1/")));
  assert.equal(files[1]!.lastmod, "2026-10-12");
});

test("recipe pages get their real rating at serve time, and none when there isn't one", () => {
  const html = `<head><script type="application/ld+json" data-recipe-schema>{"@context":"https://schema.org","@type":"Recipe","name":"Soup"}</script></head><p class="r-rating-summary" id="r-rating-summary"></p>`;
  assert.equal(withRating(html, undefined), html);
  assert.equal(withRating(html, { average: 4.2, count: 0 }), html);
  const rated = withRating(html, { average: 4.25, count: 12 });
  const data = JSON.parse(rated.match(/data-recipe-schema>(.*?)<\/script>/)![1]!);
  assert.deepEqual(data.aggregateRating, { "@type": "AggregateRating", ratingValue: 4.3, ratingCount: 12, bestRating: 5, worstRating: 1 });
  assert.match(rated, /<strong>4\.3<\/strong> · 12 ratings/, "the same figures are visible on the page");
});

test("IndexNow: key file, batched submissions of changed URLs, and an owner-only endpoint", async () => {
  assert.equal(indexNowConfig({}), undefined);
  assert.throws(() => indexNowConfig({ INDEXNOW_KEY: "short" }), /8–128/);
  const config = indexNowConfig({ INDEXNOW_KEY: "abcdef1234567890", VITE_SITE_URL: "https://s.example/" })!;
  assert.deepEqual([config.host, config.siteUrl], ["s.example", "https://s.example"]);

  const sent: { urlList: string[]; keyLocation: string }[] = [];
  const fake = (async (_url: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
  const many = Array.from({ length: 10_001 }, (_, i) => `https://s.example/p/${i}/`);
  const result = await submitUrls(many, config, fake);
  assert.deepEqual([result.accepted.length, sent.length, sent[0]!.urlList.length, sent[0]!.keyLocation], [10_001, 2, 10_000, "https://s.example/abcdef1234567890.txt"]);

  const dist = mkdtempSync(join(tmpdir(), "indexnow-"));
  writeFileSync(join(dist, "sitemap_index.xml"), `<sitemapindex><sitemap><loc>https://s.example/sitemap-recipes.xml</loc></sitemap></sitemapindex>`);
  writeFileSync(join(dist, "sitemap-recipes.xml"), `<urlset><url><loc>https://s.example/recipes/a/</loc><lastmod>2026-10-27</lastmod></url><url><loc>https://s.example/recipes/b/</loc><lastmod>2026-10-20</lastmod></url></urlset>`);
  const store = new Map<string, string>([["https://s.example/recipes/b/", "2026-10-20"]]);
  const log: SubmissionLog = {
    pending: async urls => urls.filter(u => store.get(u.url) !== (u.lastmod ?? "")),
    record: async (urls: readonly SitemapUrl[]) => { for (const u of urls) store.set(u.url, u.lastmod ?? ""); },
  };
  sent.length = 0;
  assert.deepEqual(await submitChanged(config, log, dist, fake), { submitted: 1, pending: 1, failed: [] });
  assert.deepEqual(sent[0]!.urlList, ["https://s.example/recipes/a/"], "only the page that changed");
  assert.deepEqual(await submitChanged(config, log, dist, fake), { submitted: 0, pending: 0, failed: [] });

  mkdirSync(join(dist, "x"), { recursive: true });
  const app = express();
  app.use(express.json());
  app.use("/api/indexnow", indexNowApi(config, log, "an-owner-token-that-is-long-enough", dist, fake));
  app.use(keyFile(config));
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    assert.equal(await (await fetch(`${base}/abcdef1234567890.txt`)).text(), "abcdef1234567890");
    const post = (body: unknown, token?: string) => fetch(`${base}/api/indexnow`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await post({})).status, 401);
    assert.equal((await post({}, "wrong-token-wrong-token-wrong-token")).status, 401);
    assert.equal((await post({ urls: ["https://elsewhere.example/a/"] }, "an-owner-token-that-is-long-enough")).status, 400);
    const ok = await post({ urls: ["https://s.example/guides/"] }, "an-owner-token-that-is-long-enough");
    assert.deepEqual(await ok.json(), { submitted: 1, failed: [] });
  } finally {
    server.close();
  }
});

test("every recipe's restaurant secret and swaps reach the page", () => {
  for (const recipe of recipes) {
    const page = recipeDetailPage(recipe, recipes);
    assert.ok(page.main.includes('class="r-secret"'), recipe.slug);
    assert.equal((page.main.match(/class="r-swaps__panel"/g) ?? []).length, 3, recipe.slug);
    assert.ok(recipe.prep + recipe.cook <= recipe.total, recipe.slug);
  }
});

// Keep a reference to the guide type so editors see what the fixtures are.
export type { Guide };

// ── Round two: editorial intros, more selections, share cards, planner links ──
const INTRO = (dek: string, body: string, extra = "") => `---\ndek: ${dek}\nupdated: 2026-10-29\n---\n${body}\n${extra}`;
const WORDS = "Ramen arrived here after the war and the city made it its own with a local broth. ".repeat(8);

test("guide intros: the format is checked, and every intro sits on a real, indexable guide", () => {
  const dek = "A clear soy bowl from a mountain town, seasoned in the pot rather than the bowl.";
  assert.equal(parseGuideIntro("ramen-in-takayama", INTRO(dek, WORDS, "## Know before you go\n- Go early.\n")).tips.length, 1);
  assert.throws(() => parseGuideIntro("takayama", INTRO(dek, WORDS)), /<style>-in-<city>/);
  assert.throws(() => parseGuideIntro("ramen-in-x", INTRO("Too short.", WORDS)), /dek must be 60–200/);
  assert.throws(() => parseGuideIntro("ramen-in-x", INTRO(dek, `The best ramen in town. ${WORDS}`)), /don't rank them/);
  assert.doesNotThrow(() => parseGuideIntro("ramen-in-x", INTRO(dek, `One of the best-known ramen towns. ${WORDS}`)));
  assert.throws(() => parseGuideIntro("ramen-in-x", INTRO(dek, WORDS, "## History\n- x\n")), /only section/);
  assert.throws(() => parseGuideIntro("ramen-in-x", INTRO(dek, "Too few words here.")), /120–260 words/);
  assert.throws(() => parseGuideIntro("ramen-in-x", INTRO(dek, WORDS, `## Know before you go\n${"- a\n".repeat(5)}`)), /up to 4 bullets/);
  const broken = parseGuideIntro("ramen-in-x", INTRO(dek, `${WORDS} See [this](/recipes/not-a-recipe/).`));
  assert.deepEqual(validateGuideIntros([broken], new Set(["ramen-in-y"]), new Set(["/recipes/shoyu-ramen/"])),
    ["ramen-in-x: no guide at /guides/ramen-in-x/ (renamed, or too few places now)", "ramen-in-x: link to missing page /recipes/not-a-recipe/"]);

  const intros = loadGuideIntros();
  assert.ok(intros.length >= 50, `${intros.length} intros`);
  const bySlug = new Map(guides.map(g => [g.path.slice("/guides/".length, -1), g]));
  for (const intro of intros) {
    const guide = bySlug.get(intro.slug);
    assert.ok(guide && indexEligible(guide), `${intro.slug} is an indexable guide`);
  }
  const pages = guideSite(guides, { articles: new Map(articles.map(a => [a.slug, a.title])), lastmod: "2026-10-18", intros: new Map(intros.map(i => [i.slug, i])) });
  const page = pages.find(p => p.path === "/guides/ramen-in-sapporo/")!;
  const intro = intros.find(i => i.slug === "ramen-in-sapporo")!;
  assert.ok(page.description.startsWith(intro.dek) && page.description.length <= 300);
  assert.match(page.content, /class="guide-intro"[\s\S]*By the Soupmap editors · Updated 29 October 2026[\s\S]*Know before you go/);
  assert.equal((page.structuredData as { abstract?: string }).abstract, intro.dek);
  assert.equal(page.lastmod, "2026-10-29", "an intro newer than the catalog moves lastmod");
  const verdicts = assessPages(pages.map(p => p.quality));
  for (const i of intros) assert.equal(verdicts.get(`/guides/${i.slug}/`)!.indexable, true, i.slug);
});

test("Soupmap selections: each is a full page, in a real municipality, listed once", () => {
  assert.ok(CURATED_SHOPS.length >= 35);
  const promoted = new Set(CURATED_SHOPS.map(s => s.sourceId));
  assert.equal(OPEN_SHOPS.filter(s => promoted.has(s.sourceId)).length, 0, "no open-data duplicate of a selection");
  for (const shop of CURATED_SHOPS) {
    assert.ok(isIndexableShop(shop), shop.slug);
    assert.equal(shop.verified, false, `${shop.slug}: verified only after a person checks it`);
    assert.equal(shop.priceYen, null, `${shop.slug}: no guessed prices`);
    if (!CITIES.some(c => c.name === shop.city)) {
      const place = municipalityByCode.get(shop.cityCode);
      const named = place?.parent ? municipalityByCode.get(place.parent) : place;
      assert.equal(named?.name, shop.city, `${shop.slug}: city matches cityCode ${shop.cityCode}`);
    }
    assert.ok(!/not verified|unknown/i.test(`${shop.blurb} ${shop.signatureBowl}`), shop.slug);
  }
  // Selections lead the guides they belong to.
  const yokohama = guides.find(g => g.path === "/guides/iekei-ramen-in-yokohama/")!;
  assert.equal(yokohama.shops[0]!.slug, "yoshimuraya-yokohama");
  // Their styles come from our notes, not from guessing at the name.
  assert.match(stylesHtml(yokohama.shops[0]!), /From our notes on this place/);
  assert.match(OPEN_SHOPS.map(stylesHtml).find(Boolean)!, /Suggested by the shop's name/);
});

test("share cards: wrapped text as paths, Japanese set vertically, and pages point at their card", () => {
  const lines = wrap(["@fontsource-variable/instrument-sans/files/instrument-sans-latin-standard-normal.woff2"], "word ".repeat(80), 23, 300, 3);
  assert.equal(lines.length, 3);
  assert.ok(lines[2]!.endsWith("…"));
  const svg = cardSvg({ kicker: "Recipe · Vietnam", title: "Phở bò", lede: "A clear, spiced beef broth.", footer: "Prep 30 min", mark: "フォー", site: "soupmap.com/recipes" });
  assert.match(svg, /^<svg[^>]+width="1200" height="630"/);
  assert.ok((svg.match(/<path transform=/g) ?? []).length > 40, "text is drawn as glyph paths");
  assert.match(svg, /rotate\(90/, "the long-vowel mark turns in vertical text");
  const recipe = recipeBySlug.get("miso-ramen")!;
  const page = { ...recipeDetailPage(recipe, recipes), image: recipeCardPath(recipe.slug) };
  assert.match(recipesHead(page, "https://s.example", recipes), /og:image" content="https:\/\/s\.example\/social\/recipes\/miso-ramen\.png"/);
  const guidePage = { path: "/guides/x/", title: "T", description: "D", content: "", structuredData: { "@type": "CollectionPage" }, image: guideCardPath("x") };
  assert.match(catalogDocument(guidePage, "https://s.example", "/a.css"), /og:image" content="https:\/\/s\.example\/social\/guides\/x\.png"/);
});

test("'Plan a day here' opens the planner on the guide's city, or a prefecture with enough places", () => {
  const place = (path: string) => guides.find(g => g.path === path)!.place;
  const plannable = new Set(["Fukuoka", "Kagawa"]);
  assert.equal(plannerArea(place("/guides/ramen-in-shinjuku/"), plannable), "city:tokyo");
  assert.equal(plannerArea(place("/guides/ramen-in-sapporo/"), plannable), "city:sapporo");
  assert.equal(plannerArea(place("/guides/ramen-in-kurume/"), plannable), "pref:Fukuoka");
  assert.equal(plannerArea(place("/guides/ramen-in-asahikawa/"), plannable), undefined, "no link when the prefecture isn't plannable");
  const pages = guideSite(guides, { articles: new Map(), lastmod: "2026-10-18", plannable });
  assert.match(pages.find(p => p.path === "/guides/udon-in-takamatsu/")!.content, /href="\/me\/\?area=pref%3AKagawa#plan">Plan a day here/);
});
