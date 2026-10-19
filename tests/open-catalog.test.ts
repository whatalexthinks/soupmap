import test from "node:test";
import assert from "node:assert/strict";
import { OPEN_CATALOG, OPEN_SHOPS, SHOPS } from "../src/data/shops.ts";
import { openPlaceToShop } from "../src/data/open-catalog.ts";
import { ShopSchema } from "../src/data/schema.ts";
import { shopListHtml } from "../src/render/templates.ts";
import { discover } from "../src/discovery.ts";
import {catalogResponseText} from "../src/data/load-open-catalog.ts";
import {gzipSync} from "node:zlib";

test("Japan catalog contains real, attributed, uniquely identified open-data records", () => {
  assert.ok(OPEN_SHOPS.length > 30000);
  assert.equal(new Set(SHOPS.map(s => s.slug)).size, SHOPS.length);
  assert.equal(OPEN_CATALOG.release, "2026-09-23.1");
  for (const shop of OPEN_SHOPS) {
    assert.equal(shop.dataSource, "overture");
    assert.ok(shop.sourceId);
    assert.ok(shop.sourceLicenses?.length);
    assert.equal(shop.verified, false);
    assert.equal(shop.priceYen, null);
    assert.equal(shop.hours, null);
    assert.equal(shop.signatureBowl, "Menu not verified");
  }
});

test("broad noodle categories never invent a specific ramen broth", () => {
  const shop = openPlaceToShop({ id:"example", name:"Example ramen", nameJa:"ラーメン", lat:35.68, lng:139.76,
    locality:"千代田区", category:"ramen_restaurant", licenses:["CDLA-Permissive-2.0"] });
  assert.ok(ShopSchema.safeParse(shop).success);
  assert.equal(shop.broth, "other");
  assert.equal(shop.cityCode, "00000");
  assert.equal(shop.splatUrl, null);
});

test("large lists are bounded and offer a way to see further results", () => {
  const html = shopListHtml(SHOPS);
  assert.equal((html.match(/class="shop-row"/g) ?? []).length, 100);
  assert.match(html, /data-load-more/);
  assert.equal((shopListHtml(SHOPS, null, new Set(), false, 200).match(/class="shop-row"/g) ?? []).length, 200);
});

test("nationwide search includes places outside the featured city shortcuts", () => {
  const shop = OPEN_SHOPS.find(s => s.neighborhood === "八重山郡竹富町");
  assert.ok(shop);
  const results = discover(SHOPS, {query:shop.name,city:"all",broths:new Set(),saved:new Set(),savedOnly:false,sort:"guide"});
  assert.ok(results.some(s => s.slug === shop.slug));
});

test("catalog transport supports both browser-decoded and raw gzip responses", async () => {
  const json = JSON.stringify({records:[{name:"拉麺"}]});
  assert.equal(await catalogResponseText(new Response(json)),json);
  assert.equal(await catalogResponseText(new Response(gzipSync(json))),json);
  await assert.rejects(catalogResponseText(new Response("Unavailable",{status:503})),/could not load/);
});
