import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { shopRowHtml } from "../src/render/templates.ts";
import { ORDERED_SHOPS } from "../src/data/shops.ts";

test("app styles are render-blocking HTML links, not dependent on JavaScript startup", () => {
  const html = readFileSync(new URL("../map/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/app.css", import.meta.url), "utf8");
  assert.match(html, /<link rel="stylesheet" href="\/src\/styles\/app\.css"\s*\/>/);
  assert.ok(html.indexOf("/src/styles/app.css") < html.indexOf("<body>"));
  for (const stylesheet of ["main", "atlas", "catalog", "streetview", "discovery-controls", "mobile-map", "shortlist-share", "history"]) {
    assert.ok(css.includes(`"./${stylesheet}.css"`), stylesheet);
  }
});

test("prerendered shop links select the map even without click handlers", async () => {
  const window = new Window({ url: "https://soupmap.example/" });
  try {
    for (const shop of ORDERED_SHOPS.slice(0, 20)) {
      window.document.body.innerHTML = shopRowHtml(shop, false);
      const link = window.document.querySelector<HTMLAnchorElement>(".shop-row")!;
      const url = new URL(link.href);
      assert.equal(url.pathname, "/map/");
      assert.equal(url.hash, `#${shop.slug}`);
    }
  } finally {
    await window.happyDOM.close();
  }
});
