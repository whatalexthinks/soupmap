import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { inferStyles, brothFromStyles } from "../src/data/styles.ts";
import { openPlaceToShop, type OpenPlace } from "../src/data/open-catalog.ts";
import { ShopSchema } from "../src/data/schema.ts";
import { prefectureFromPostcode, prefectureFromText, fillByNeighbours, correctOutliers } from "../scripts/lib/prefecture.ts";
import { decodeCore, detailShard, encodeCore, type CoreCatalog } from "../src/data/catalog-format.ts";
import { OPEN_CATALOG, OPEN_SHOPS, SHOPS, CHAIN_SIZES } from "../src/data/shops.ts";
import { discover } from "../src/discovery.ts";
import { contactHtml, nationalPhone } from "../src/ui/shop-details.ts";
import { createRomanizer, localityNamer } from "../scripts/lib/romanize.ts";
import { matchBrand } from "../scripts/lib/brands.ts";
import { clusterGlyph, clusterHeight, markerColor, markerKind } from "../src/map/glyph.ts";

const base: OpenPlace = { id: "0a1b2c3d-0000-0000-0000-000000000000", name: "ラーメン", nameJa: "ラーメン",
  lat: 35.68, lng: 139.76, locality: "千代田区", category: "ramen_restaurant", licenses: ["CDLA-Permissive-2.0"] };
const search = (query: string, extra = {}) => discover(SHOPS, { query, city: "all", broths: new Set(), saved: new Set(), savedOnly: false, sort: "guide", ...extra });

test("styles come only from explicit words in the shop's own name", () => {
  assert.deepEqual(inferStyles("味噌ラーメン 一番").map(s => s.id), ["miso"]);
  assert.deepEqual(inferStyles("横浜家系ラーメン 町田商店").map(s => s.id), ["iekei"]);
  assert.equal(brothFromStyles(inferStyles("横浜家系ラーメン")), "tonkotsu");
  // Place names and soft Hakata udon must not become ramen styles.
  assert.deepEqual(inferStyles("塩釜ラーメン").map(s => s.id), []);
  assert.deepEqual(inferStyles("塩尻 中華そば").map(s => s.id), ["chuka-soba"]);
  assert.deepEqual(inferStyles("博多うどん はち").map(s => s.id), []);
  assert.deepEqual(inferStyles("らーめん 大").map(s => s.id), []);
});

test("a name-suggested broth is recorded as such; a broad category never invents one", () => {
  const miso = openPlaceToShop({ ...base, styles: ["miso"] });
  assert.equal(miso.broth, "miso");
  assert.equal(miso.brothSource, "name");
  assert.ok(ShopSchema.safeParse(miso).success);
  const plain = openPlaceToShop(base);
  assert.equal(plain.broth, "other");
  assert.equal(plain.brothSource, undefined);
});

test("unsafe or malformed contact fields never reach a shop", () => {
  const shop = openPlaceToShop({ ...base, website: "javascript:alert(1)", socials: ["ftp://x.example", "https://www.instagram.com/soup"], phone: "12345" });
  assert.equal(shop.website, undefined);
  assert.deepEqual(shop.socials, ["https://www.instagram.com/soup"]);
  assert.equal(shop.phone, undefined);
  const html = contactHtml({ website: "javascript:alert(1)", address: "<b>1-2-3</b>", phone: "+81312345678" });
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes("&lt;b&gt;1-2-3&lt;/b&gt;"));
  assert.ok(html.includes('href="tel:+81312345678"'));
});

test("phone numbers read like Japanese numbers", () => {
  assert.equal(nationalPhone("+81312345678"), "03-1234-5678");
  assert.equal(nationalPhone("+819012345678"), "090-1234-5678");
  assert.equal(nationalPhone("+81922345678"), "092-234-5678");
});

test("prefectures come from full names or postcode prefixes, never ward names", () => {
  assert.equal(prefectureFromPostcode("160-0022"), 13);
  assert.equal(prefectureFromPostcode("8100001"), 40);
  assert.equal(prefectureFromPostcode("906-0202"), 47);
  assert.equal(prefectureFromPostcode("abc"), undefined);
  assert.equal(prefectureFromText("東京都新宿区西新宿"), 13);
  assert.equal(prefectureFromText("Tōkyō-to"), 13);
  assert.equal(prefectureFromText("Saitama Prefecture"), 11);
  assert.equal(prefectureFromText("福島区海老江"), undefined);
  assert.equal(prefectureFromText("北区"), undefined);
});

test("neighbours fill gaps and overrule a lone mislabelled record", () => {
  const cluster = Array.from({ length: 8 }, (_, i) => ({ lat: 34.69 + i * 0.001, lng: 135.49, prefecture: 27 as number | undefined }));
  const wrong = { lat: 34.6935, lng: 135.4905, prefecture: 7 as number | undefined };
  const unknown = { lat: 34.6945, lng: 135.4902, prefecture: undefined as number | undefined };
  const records = [...cluster, wrong, unknown];
  assert.equal(correctOutliers(records), 1);
  assert.equal(wrong.prefecture, 27);
  assert.equal(fillByNeighbours(records), 1);
  assert.equal(unknown.prefecture, 27);
});

test("the compact browser core round-trips the map and search fields", () => {
  const places: OpenPlace[] = [{ ...base, nameRomanized: "Ramen", styles: ["miso", "sapporo"], chain: "Example", prefecture: 13 },
    { ...base, id: "ff000000-0000-0000-0000-000000000000", name: "Udon", nameJa: "うどん", category: "japanese_restaurant", licenses: ["CDLA-Permissive-2.0", "Apache-2.0"], nameSource: "brand" }];
  const core = encodeCore({ release: "r", generatedAt: "g", attribution: "a", notice: "n" }, places);
  assert.deepEqual(decodeCore(JSON.parse(JSON.stringify(core)) as CoreCatalog), places);
  assert.equal(detailShard("6D814c38-cdac"), "6d");
  assert.throws(() => detailShard("open-xyz"));
});

test("the shipped core and detail shards agree with the full dataset", () => {
  const read = (path: string) => JSON.parse(gunzipSync(readFileSync(new URL(`../public/data/${path}`, import.meta.url))).toString("utf8"));
  const core = decodeCore(read("open-shops-core.json.gz") as CoreCatalog);
  assert.equal(core.length, OPEN_CATALOG.records.length);
  const sample = OPEN_CATALOG.records.find(r => r.address && r.phone)!;
  const fromCore = core.find(r => r.id === sample.id)!;
  assert.equal(fromCore.nameRomanized, sample.nameRomanized);
  assert.equal(fromCore.address, undefined);
  assert.equal(read(`details/${detailShard(sample.id)}.json.gz`)[sample.id].address, sample.address);
});

test("every open record has a prefecture, and chains are real repeated brands", () => {
  assert.ok(OPEN_SHOPS.every(s => s.prefecture));
  assert.ok(OPEN_SHOPS.filter(s => s.styles?.length).length > 3000);
  assert.ok((CHAIN_SIZES.get("Hanamaru Udon") ?? 0) > 100);
  for (const [chain, size] of CHAIN_SIZES) assert.ok(size >= 6, chain);
  assert.ok(!CHAIN_SIZES.has("Sapporo Ramen") && !CHAIN_SIZES.has("ラーメン"));
});

test("search reaches prefectures, styles and chains; chains can be hidden", () => {
  // Substring search also matches "Nakagawa"; most results must still be in Kagawa itself.
  const kagawa = search("kagawa udon");
  assert.ok(kagawa.length > 50);
  assert.ok(kagawa.filter(s => s.prefecture === "Kagawa").length / kagawa.length > 0.8);
  assert.ok(search("iekei").length > 100);
  const hanamaru = search("hanamaru");
  assert.ok(hanamaru.length > 100 && hanamaru.every(s => s.chain === "Hanamaru Udon" || !s.chain));
  assert.equal(search("hanamaru", { hideChains: true }).filter(s => s.chain).length, 0);
});

test("English names use readings a traveller would recognise", async () => {
  const romanize = await createRomanizer();
  assert.equal(romanize("大勝軒"), "Taishoken");
  assert.equal(romanize("井上"), "Inoue");
  assert.equal(romanize("家系ラーメン王道 いしい"), "Iekei Ramen Odo Ishii");
  assert.equal(romanize("たけろくらーめん 松山店"), "Takeroku Ramen Matsuyama");
  assert.equal(romanize("らーめん本店"), "Ramen Honten");
  const place = localityNamer(romanize);
  assert.equal(place("大阪市中央区"), "Chuo, Osaka");
  assert.equal(place("仲多度郡まんのう町"), "Manno");
  assert.deepEqual(matchBrand("はなまるうどん 松山店"), { english: "Hanamaru Udon", rest: "松山店" });
});

test("markers stay small and come from a bounded palette", () => {
  assert.equal(markerKind({ slug: "afuri-ebisu" }, false), "pick");
  assert.equal(markerKind({ slug: "open-abc" }, true), "saved");
  assert.equal(markerKind({ slug: "open-abc" }, false), "dot");
  const colors = new Set(SHOPS.map(markerColor));
  assert.ok(colors.size <= 14, `${colors.size} marker colours`);
  assert.deepEqual([2, 15, 150, 15_000].map(clusterHeight), [20, 22, 25, 28]);
  assert.equal(typeof clusterGlyph, "function");
});

test("the lockfile only points at the public npm registry", () => {
  const lock = readFileSync(new URL("../package-lock.json", import.meta.url), "utf8");
  const hosts = new Set([...lock.matchAll(/"resolved": "(https?:\/\/[^/"]+)/g)].map(m => m[1]));
  assert.deepEqual([...hosts], ["https://registry.npmjs.org"]);
});
