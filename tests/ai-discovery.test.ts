import { test } from "node:test";
import assert from "node:assert/strict";
import { soupmapHtml } from "../vite.config.ts";

function discoveryAssets(siteUrl?: string): Map<string, string> {
  const plugin = soupmapHtml(siteUrl ? { VITE_SITE_URL: siteUrl } : {});
  const hook = plugin.generateBundle;
  assert.equal(typeof hook, "function");
  const assets = new Map<string, string>();
  // Exercise the real build hook without bundling the map or writing build outputs.
  (hook as Function).call({
    emitFile(asset: { fileName: string; source: string }) {
      assets.set(asset.fileName, asset.source);
    },
  }, {}, {
    "credits/index.html": { type: "asset", source: '<link rel="stylesheet" href="/assets/credits-test.css">' },
    "journal/index.html": { type: "asset", source: '<link rel="stylesheet" href="/assets/journal-test.css">' },
    "recipes/index.html": { type: "asset", source: '<script type="module" crossorigin src="/assets/recipes-test.js"></script><link rel="stylesheet" href="/assets/recipes-test.css">' },
  });
  return assets;
}

test("AI guide uses the configured canonical origin and existing public resources", () => {
  const assets = discoveryAssets("https://atlas.example///");
  const guide = assets.get("llms.txt");
  assert.ok(guide);
  for (const path of ["/", "/credits/", "/data/open-shops.json.gz", "/sitemap_index.xml", "/recipes/recipes.json", "/guides/", "/llms-full.txt", "/sitemap-recipes.xml", "/sitemap-catalog.xml", "/sitemap-cities.xml"]) {
    assert.ok(guide.includes(`(https://atlas.example${path})`), path);
  }
  for (const name of ["llms.txt", "llms-full.txt"]) {
    assert.ok(!assets.get(name)!.includes("soupmap.com"), name);
    assert.ok(!assets.get(name)!.includes("https://atlas.example//"), name);
  }
  assert.ok(assets.get("robots.txt")!.includes("Sitemap: https://atlas.example/sitemap.xml"));
  assert.ok(assets.get("robots.txt")!.includes("Disallow: /api/"));
  assert.equal(assets.get("sitemap.xml"), assets.get("sitemap_index.xml"), "the URL already in Search Console serves the index");
  assert.match(assets.get("sitemap-pages.xml")!, /https:\/\/atlas\.example\/credits\//);
  // The full guide lists every recipe, and the JSON feed carries the same recipes as data.
  const full = assets.get("llms-full.txt")!;
  const feed = JSON.parse(assets.get("recipes/recipes.json")!) as { count: number; recipes: { url: string; ingredients: string[]; steps: string[]; prepMinutes: number }[] };
  assert.equal(feed.recipes.length, feed.count);
  for (const recipe of feed.recipes) {
    assert.ok(full.includes(`(${recipe.url})`), recipe.url);
    assert.ok(recipe.url.startsWith("https://atlas.example/recipes/") && recipe.ingredients.length >= 3 && recipe.steps.length >= 3 && recipe.prepMinutes > 0);
  }
});

test("AI guide qualifies scope, verification, romanizations, licensing, and access", () => {
  const guide = discoveryAssets().get("llms.txt")!;
  assert.match(guide, /\(https:\/\/soupmap\.com\/\)/);
  for (const limitation of [
    /worldwide soup atlas/,
    /Japan pilot, not worldwide coverage/,
    /Coverage is incomplete/,
    /unverified reported locations/,
    /romanizations.*approximate readings/,
    /not official English names/,
    /each record's licenses/,
    /gzip-compressed JSON/,
    /not an indexing requirement/,
    /does not grant crawl access or training permission/,
    /not dedicated city or shop pages/,
  ]) {
    assert.match(guide, limitation);
  }
});
