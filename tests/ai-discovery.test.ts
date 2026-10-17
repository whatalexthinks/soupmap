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
  });
  return assets;
}

test("AI guide uses the configured canonical origin and existing public resources", () => {
  const assets = discoveryAssets("https://atlas.example///");
  const guide = assets.get("llms.txt");
  assert.ok(guide);
  for (const path of ["/", "/credits/", "/data/open-shops.json.gz", "/sitemap.xml"]) {
    assert.ok(guide.includes(`(https://atlas.example${path})`));
  }
  assert.ok(!guide.includes("soupmap.com"));
  assert.ok(!guide.includes("https://atlas.example//"));
  assert.match(assets.get("robots.txt")!, /User-agent: \*\nAllow: \//);
  assert.match(assets.get("sitemap.xml")!, /https:\/\/atlas\.example\/credits\//);
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
