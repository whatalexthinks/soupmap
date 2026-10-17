import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { ORDERED_SHOPS, CURATED_SHOPS, OPEN_SHOPS } from "../src/data/shops.ts";
import { isIndexableShop, shopPath } from "../src/data/indexation.ts";
import { catalogDocument, catalogPages, CATALOG_PAGE_SIZE } from "../src/render/catalog.ts";
import { cityButtonsHtml, shopRowHtml } from "../src/render/templates.ts";
import { soupmapHtml } from "../vite.config.ts";

const pages = catalogPages(ORDERED_SHOPS);
const origin = "https://atlas.example";

test("indexation gates out thin locations, not merely unverified records", () => {
  assert.equal(CURATED_SHOPS.filter(isIndexableShop).length, CURATED_SHOPS.length);
  assert.equal(OPEN_SHOPS.filter(isIndexableShop).length, 0);
  const shop = CURATED_SHOPS[0]!;
  assert.ok(isIndexableShop({ ...shop, verified: false }));
  for (const change of [
    { signatureBowl: "Menu not verified" }, { blurb: "A short placeholder." },
    { neighborhood: "Japan" }, { lat: NaN },
  ]) assert.equal(isIndexableShop({ ...shop, ...change }), false);
  assert.equal(shopPath(shop), `/shop/${shop.slug}/`);
  assert.equal(shopPath(OPEN_SHOPS[0]!), `/#${OPEN_SHOPS[0]!.slug}`);
});

test("real page anchors replace fragment links only where a shop document exists", () => {
  const shop = CURATED_SHOPS[0]!;
  assert.ok(shopRowHtml(shop, false).includes(`href="/shop/${shop.slug}/"`));
  assert.ok(shopRowHtml(OPEN_SHOPS[0]!, false).includes('href="/#open-'));
  const cities = cityButtonsHtml(ORDERED_SHOPS);
  assert.match(cities, /<a href="\/catalog\/"/);
  assert.match(cities, /<a href="\/city\/fukuoka\/"/);
});

test("every national record is visible in paginated HTML without filter interactions", () => {
  const national = pages.filter(p => p.path.startsWith("/catalog/"));
  assert.equal(national.length, Math.ceil(ORDERED_SHOPS.length / CATALOG_PAGE_SIZE));
  const rendered = national.map(p => p.content).join("");
  const links = [...rendered.matchAll(/<h2><a href="(?:\/shop\/([^/]+)\/|\/#([^"]+))"/g)]
    .map(m => m[1] || m[2]);
  assert.equal(links.length, ORDERED_SHOPS.length);
  const slugs = new Set(links);
  assert.equal(slugs.size, ORDERED_SHOPS.length);
  for (const shop of ORDERED_SHOPS) assert.ok(slugs.has(shop.slug), shop.slug);
  assert.ok(!national.at(-1)!.content.includes('rel="next"'));
  assert.ok(national[0]!.content.includes('rel="next" href="/catalog/page/2/"'));
  assert.ok(national[1]!.content.includes('rel="prev" href="/catalog/"'));
});

test("all indexable documents have unique metadata and are reachable by ordinary links", () => {
  for (const property of ["path", "title", "description"] as const) {
    assert.equal(new Set(pages.map(p => p[property])).size, pages.length, property);
  }
  const routes = new Map(pages.map(p => [p.path, p]));
  const visited = new Set<string>();
  const pending = ["/catalog/"];
  while (pending.length) {
    const path = pending.pop()!;
    if (visited.has(path)) continue;
    visited.add(path);
    const page = routes.get(path);
    assert.ok(page, `Crawlable route exists: ${path}`);
    for (const match of page.content.matchAll(/href="(\/(?:shop|city|catalog)\/[^"#]*)"/g)) {
      assert.ok(routes.has(match[1]!), `No dead static links: ${match[1]}`);
      if (!visited.has(match[1]!)) pending.push(match[1]!);
    }
  }
  assert.equal(visited.size, pages.length);
  assert.equal(pages.filter(p => p.path.startsWith("/shop/")).length, CURATED_SHOPS.length);
});

test("shop HTML contains facts, truthful verification, provenance and matching social metadata", async () => {
  const shop = CURATED_SHOPS[0]!;
  const page = pages.find(p => p.path === shopPath(shop))!;
  const window = new Window();
  window.document.write(catalogDocument(page, origin, "/assets/credits.css"));
  const doc = window.document;
  assert.equal(doc.title, page.title);
  assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute("href"), origin + page.path);
  assert.equal(doc.querySelector('meta[property="og:url"]')?.getAttribute("content"), origin + page.path);
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    assert.equal(doc.querySelector(selector)?.getAttribute("content"), page.description);
  }
  const content = doc.querySelector("main")!.textContent;
  for (const fact of [shop.name, shop.nameJa, shop.blurb, shop.signatureBowl, shop.neighborhood,
    String(shop.lat), "Not verified", "Unverified location", shop.sourceId!]) assert.ok(content.includes(fact), fact);
  assert.ok(doc.querySelector('a[href="/credits/"]'));
  const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent);
  assert.equal(data.url, origin + page.path);
  assert.equal(data.about["@type"], "Place");
  assert.ok(!data.aggregateRating && !data.openingHours && !data.priceRange);
  assert.equal(doc.querySelectorAll('script:not([type="application/ld+json"])').length, 0);
  await window.happyDOM.close();
});

test("static output and sitemap agree; thin shops are not emitted", () => {
  const plugin = soupmapHtml({ VITE_SITE_URL: `${origin}/` });
  const assets = new Map<string, string>();
  (plugin.generateBundle as Function).call({
    emitFile(asset: { fileName: string; source: string }) { assets.set(asset.fileName, asset.source); },
  }, {}, {
    "credits/index.html": { type: "asset", source: '<link rel="stylesheet" crossorigin href="/assets/credits-built.css">' },
  });
  const sitemap = assets.get("sitemap.xml")!;
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(locations.length, pages.length + 2);
  for (const page of pages) {
    assert.ok(locations.includes(origin + page.path));
    const html = assets.get(`${page.path.slice(1)}index.html`)!;
    assert.ok(html);
    assert.ok(html.includes(`href="${origin + page.path}"`));
    assert.ok(html.includes('href="/assets/credits-built.css"'));
  }
  assert.ok(!assets.has(`shop/${OPEN_SHOPS[0]!.slug}/index.html`));
  assert.ok(!sitemap.includes("/#") && !sitemap.includes("/page/1/"));
});
