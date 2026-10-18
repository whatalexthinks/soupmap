/**
 * Full-app browser regression checks. Only the --live cases use real Google
 * lookup, imagery and navigation; controlled cases deliberately inject failures.
 * Never persist browser errors, network logs, traces, HARs, storage or HTML.
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const live = process.argv.includes("--live");
const filter = process.argv.find(arg => arg.startsWith("--filter="))?.slice(9);
const base = process.env.STREETVIEW_BASE_URL;
const origin = base ? new URL(base).origin
  : process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000";
const output = resolve("generated-artifacts/streetview");
const executablePath = process.env.CHROMIUM_PATH
  || (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);
const viewports = [
  { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
];
const shops = ["afuri-ebisu", "rokurinsha-tokyo-station"];
const results = [];
let browser;

class CheckFailure extends Error {}
function check(condition, message) {
  if (!condition) throw new CheckFailure(message);
}
async function until(page, predicate, message, timeout = 45000) {
  try { await page.waitForFunction(predicate, undefined, { timeout }); }
  catch { throw new CheckFailure(message); }
}

// Test-only module interception: production has no test globals or SDK bypass.
// The real StreetView class, overlay/CSS and app controls remain under test.
async function instrument(page, mode) {
  if (mode !== "live") {
    await page.route("**/src/app.ts", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const keyField = /googleKey = [^;\n]+;/;
      check(keyField.test(source), "Controlled key hook no longer matches source");
      await route.fulfill({ response, body: source.replace(keyField,
        'googleKey = "browser-test-placeholder";') });
    });
  }
  await page.route("**/src/map/streetview.ts", async route => {
    const response = await route.fetch();
    const source = await response.text();
    check(source.includes("this.panorama = panorama;"), "Viewer observation hook no longer matches source");
    await route.fulfill({ response, body: source.replace("this.panorama = panorama;",
      "this.panorama = panorama; window.__svPanorama = panorama;") });
  });
  if (mode === "live" || mode === "denial") {
    if (mode === "denial") {
      // Exercise the real loader's gm_authFailure handler without using a key
      // against Google, or depending on a real billing/restriction misconfiguration.
      await page.route("https://maps.googleapis.com/maps/api/js?**", route =>
        route.fulfill({ contentType: "application/javascript", body: "window.gm_authFailure();" }));
    }
    return;
  }
  await page.route("**/src/map/google-loader.ts", route => route.fulfill({
    contentType: "application/javascript",
    body: `
      const mode = ${JSON.stringify(mode)};
      const library = {
        StreetViewSource: {GOOGLE:"google", OUTDOOR:"outdoor"},
        StreetViewPreference: {BEST:"best"},
        StreetViewService: class {
          async getPanorama(request) {
            (window.__svRadii ??= []).push(request.radius);
            if (mode === "missing") throw {code:"ZERO_RESULTS"};
            return {data:{location:{pano:"controlled",latLng:{lat:()=>35.68,lng:()=>139.76}}}};
          }
        },
        StreetViewPanorama: class {
          constructor(host) {
            host.style.position = "relative";
            this.ready = false; this.listeners = [];
            window.__svReleaseRenderer = () => {
              this.ready = true; this.listeners.forEach(fn => fn());
            };
          }
          getStatus() { return this.ready ? "OK" : null; }
          addListener(name, fn) { this.listeners.push(fn); return {remove(){}}; }
          setVisible() {}
        }
      };
      export async function loadInteractiveStreetView() {
        if (mode === "sdk-loading" && !window.__svSDKReleased) {
          window.__svSDKWaiting = true;
          await new Promise(resolve => { window.__svReleaseSDK = () => {
            window.__svSDKReleased = true; resolve();
          }; });
        }
        return library;
      }
    `,
  }));
}

async function backIsOnTop(page) {
  check(await page.locator("#pano-back").isVisible(), "Back to map is not visible");
  check(await page.locator("#pano-back").evaluate(button => {
    const r = button.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight
      && r.left >= 0 && r.right <= innerWidth
      && button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }), "Back to map is covered by the viewer or outside the viewport");
}

async function closed(page) {
  await until(page, () => !document.querySelector(".interactive-streetview")
    && !document.body.classList.contains("is-pano")
    && document.querySelector("#pano-bar").hidden, "Back to map did not dismiss Street View");
  check(await page.locator('[data-action="stand-outside"]').isEnabled(), "Map entry control did not recover");
  check(await page.locator('[data-action="stand-outside"]').evaluate(el => el === document.activeElement),
    "Focus did not return to Street View entry");
}

async function navigateArrow(page, touch) {
  let point;
  try {
    const handle = await page.waitForFunction(() => {
      const arrows = document.querySelectorAll(
        '.interactive-streetview__renderer [role="button"][aria-label^="Go "]');
      for (const arrow of arrows) {
        const r = arrow.getBoundingClientRect();
        // Google's SVG chevrons have hollow bounding-box centers. Find an
        // actual painted hit target rather than force-clicking through the map.
        for (let y = Math.max(1, r.y + 2); y < Math.min(innerHeight, r.bottom); y += 3) {
          for (let x = Math.max(1, r.x + 2); x < Math.min(innerWidth, r.right); x += 3) {
            if (arrow.contains(document.elementFromPoint(x, y))) return { x, y };
          }
        }
      }
      return null;
    }, undefined, { timeout: 15000 });
    point = await handle.jsonValue();
    await handle.dispose();
  } catch {
    throw new CheckFailure("Native navigation arrows have no accessible hit target");
  }
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

async function imagery(page, name) {
  await until(page, () => {
    const host = document.querySelector(".interactive-streetview__renderer");
    const r = host?.getBoundingClientRect();
    return r && r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95
      && [...host.querySelectorAll("canvas, img")].some(el => {
        const b = el.getBoundingClientRect();
        return b.width > 100 && b.height > 100 && (el.tagName !== "IMG" || el.naturalWidth > 0);
      });
  }, "Google imagery is missing or its renderer has collapsed", 60000);
  // Pixel evidence, not merely status OK or the presence of a canvas. Sample a
  // central band away from labels/controls; include both sides because the
  // heading toward a shop can legitimately face a plain pillar or wall.
  let rendered = false;
  for (let attempt = 0; attempt < 12 && !rendered; attempt++) {
    const viewport = page.viewportSize();
    const buffer = await page.screenshot({ type: "png", clip: {
      x: Math.floor(viewport.width * 0.08), y: Math.floor(viewport.height / 2 - 90),
      width: Math.floor(viewport.width * 0.84), height: 180,
    } });
    rendered = await page.evaluate(async data => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 16) {
        colors.add(`${pixels[i] >> 3},${pixels[i+1] >> 3},${pixels[i+2] >> 3}`);
      }
      return colors.size > 80;
    }, buffer.toString("base64"));
    if (!rendered) await page.waitForTimeout(1500);
  }
  check(rendered, "Viewer has no visible detailed imagery (blank/flat pixel sample)");
  await backIsOnTop(page);
  await page.screenshot({ path: `${output}/${name}.jpg`, type: "jpeg", quality: 75 });
}

async function run(viewport, mode, slug = shops[0]) {
  const name = `${viewport.name}-${mode}-${slug}`;
  if (filter && !name.includes(filter)) return;
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile, hasTouch: viewport.hasTouch, deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  let stage = "setup";
  try {
    // Stop unrelated 3D streaming; this suite tests native Google Street View,
    // not Cesium. UI startup is explicitly designed to survive map failure.
    await page.route("**/src/map/engine.ts", route => route.abort());
    await instrument(page, mode);
    await page.goto(`${origin}/#${slug}`, { waitUntil: "domcontentloaded" });
    const entry = page.locator('[data-action="stand-outside"]');
    stage = "entry";
    await entry.waitFor({ state: "visible" });
    check(await entry.isEnabled(), "Street View entry is disabled; configure Maps JavaScript API access");
    await entry.click();
    stage = "loading";
    if (mode === "sdk-loading" || mode === "renderer-loading") {
      await until(page, mode === "sdk-loading" ? () => window.__svSDKWaiting
        : () => !!document.querySelector(".interactive-streetview__renderer"), "Loading stage was not reached");
      await backIsOnTop(page);
      await page.locator("#pano-back").click();
      await closed(page);
      await page.evaluate(mode => mode === "sdk-loading"
        ? window.__svReleaseSDK() : window.__svReleaseRenderer(), mode);
      // Flush both the lookup and renderer continuations after cancellation.
      await page.waitForTimeout(500);
      await closed(page);
      // Reopening must still work; a stale completion must not lock entry.
      await entry.click();
      await until(page, () => !!document.querySelector(".interactive-streetview__renderer"), "Cannot reopen after cancellation");
      await page.evaluate(() => window.__svReleaseRenderer());
      await until(page, () => document.querySelector("#pano-label")?.textContent.includes("Exploring near"),
        "Reopened viewer did not finish");
    } else if (mode === "missing" || mode === "denial") {
      stage = "failure recovery";
      await until(page, () => !document.body.classList.contains("is-pano")
        && document.querySelector('[data-action="stand-outside"]').disabled, "Failure did not exit the loading UI");
      const text = await page.locator(".street-view-actions").innerText();
      check(mode === "missing" ? text.includes("No official outdoor") : text.includes("Maps JavaScript API"),
        "Failure lacks actionable coverage/API explanation");
      check(await page.locator(".street-view-link").isVisible(), "Google Maps fallback is unavailable");
      check(await page.locator(".interactive-streetview").count() === 0, "Failed viewer was not removed");
      check(await page.locator("#pano-bar").isHidden(), "Back bar remained after failure");
      if (mode === "missing") {
        check(JSON.stringify(await page.evaluate(() => window.__svRadii)) === "[250,500]",
          "Missing coverage did not widen the lookup");
      }
    } else {
      stage = "real viewer";
      await until(page, () => window.__svPanorama?.getStatus() === "OK"
        && document.querySelector("#pano-label")?.textContent.includes("Exploring near"),
      "Real Google viewer failed: check API access, billing, allowed origin and coverage", 90000);
      await imagery(page, `${name}-initial`);
      stage = "connected navigation";
      await until(page, () => window.__svPanorama.getLinks()?.some(link => link.pano),
        "No connected Street View navigation is available");
      check(await page.evaluate(() => window.__svPanorama.get("linksControl") === true
        && window.__svPanorama.get("clickToGo") === true), "Native connected navigation controls are disabled");
      await page.evaluate(() => {
        window.__svPreviousPano = window.__svPanorama.getPano();
      });
      await navigateArrow(page, viewport.hasTouch);
      await until(page, () => window.__svPanorama.getPano() !== window.__svPreviousPano
        && window.__svPanorama.getStatus() === "OK", "Connected navigation did not change the real panorama");
      await imagery(page, `${name}-navigated`);
    }
    if (!["missing", "denial"].includes(mode)) {
      stage = "back to map";
      await backIsOnTop(page);
      await page.locator("#pano-back").click();
      await closed(page);
    }
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    // Deliberately do not serialize exception values: browser errors may contain
    // complete Google URLs with keys, page HTML or shared-list bearer links.
    const reason = error instanceof CheckFailure ? error.message : "Browser operation failed";
    results.push({ name, passed: false, stage, reason });
    console.error(`FAIL ${name} (${stage}): ${reason}; see docs/streetview-browser-checks.md`);
  } finally {
    await context.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ executablePath, headless: true, args: [
    "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  ] });
  for (const viewport of viewports) {
    for (const mode of ["sdk-loading", "renderer-loading", "denial", "missing"]) await run(viewport, mode);
    if (live) for (const shop of shops) await run(viewport, "live", shop);
  }
} catch {
  console.error("Browser checks could not start. Start Vite and configure Chromium; see docs/streetview-browser-checks.md");
  process.exitCode = 1;
} finally {
  await browser?.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ live, results }, null, 2));
}
if (!results.length || results.some(result => !result.passed)) process.exitCode = 1;
