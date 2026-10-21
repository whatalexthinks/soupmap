import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { siteNavigationHtml } from "../src/render/site-navigation.ts";
import { renderSiteShell } from "../src/render/shell.ts";

test("site menu has public and account destinations without JavaScript", async () => {
  const window = new Window();
  try {
    window.document.write(siteNavigationHtml());
    assert.ok(window.document.querySelector("details > summary"));
    const hrefs = [...window.document.querySelectorAll("nav a")].map(a => a.getAttribute("href"));
    assert.deepEqual(hrefs, ["/", "/map/", "/catalog/", "/journal/", "/account", "/account/settings", "/sign-in"]);
  } finally { await window.happyDOM.close(); }
});

test("all static shells include the shared menu and signed-in home stays reachable", () => {
  for (const file of ["index.html", "map/index.html", "account/index.html", "credits/index.html"]) {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const rendered = renderSiteShell(html);
    assert.match(rendered, /class="site-header/);
    assert.match(rendered, /class="site-brand-mark" src="\/brand-mark-black.png"/);
    for (const href of ["/catalog/", "/map/", "/me/", "/journal/", "/recipes/", "/account"]) {
      assert.ok(rendered.includes(`href="${href}"`), `${file}: missing ${href}`);
    }
  }
  const account = readFileSync(new URL("../src/account.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(account, /location\.replace\(["']\/account/);
  assert.match(account, /<UserProfile routing="path"/);
  assert.match(account, /path="\/sign-in\/\*\?"/);
  assert.match(account, /path="\/sign-up\/\*\?"/);
});
