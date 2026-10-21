import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const base = process.argv[2] || "http://127.0.0.1:5000/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined),
  headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({width, height: 900});
    for (const path of ["/", "/map/", "/catalog/", "/journal/", "/recipes/", "/me/", "/credits/", "/account", "/account/settings", "/sign-in", "/sign-up"]) {
      const response = await page.goto(new URL(path, base).href);
      assert.equal(response.status(), 200, path);
      const menu = page.locator(".site-header");
      assert.equal(await menu.locator(".site-nav a").count(), 5);
      const bounds = await menu.locator(".site-nav").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `${path}: navigation outside viewport at ${width}`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path}: overflow at ${width}`);
      // A real click must leave the current page, including when leaving the map.
      await menu.getByRole("link", {name: "Soupmap home", exact: true}).click();
      await page.waitForURL(new URL("/", base).href);
    }
  }
  for (const [path, field] of [["/sign-in", "identifier"], ["/sign-up", "emailAddress"]]) {
    await page.goto(new URL(path, base).href);
    await page.locator(`input[name="${field}"]`).waitFor();
    assert.equal(await page.locator('input[name="password"]').count(), 1);
  }
  const response = await page.request.get(new URL("/api/me", base).href);
  assert.equal(response.status(), 401, "Private lists require authentication");
  console.log("Navigation works at phone/desktop widths; email/password screens load; private API rejects guests.");
} finally { await browser.close(); }
