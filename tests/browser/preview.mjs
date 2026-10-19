/**
 * Verify the development preview through its actual HTTPS proxy, including
 * Vite's connected frame. A successful HTTP response alone is insufficient.
 * Pass a development URL as the first argument to override the default.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = new URL(process.argv[2] || (process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}/`
  : "http://127.0.0.1:5000/"));
const executablePath = process.env.CHROMIUM_PATH
  || (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined);
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
let timer;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const connected = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Preview loaded without a working Vite WebSocket.")), 20_000);
    page.on("websocket", socket => {
      socket.on("framereceived", frame => {
        let payload;
        try { payload = JSON.parse(String(frame.payload)); } catch { return; }
        if (payload.type === "connected") resolve(new URL(socket.url()));
      });
    });
  });
  const [socketUrl, response] = await Promise.all([
    connected,
    page.goto(baseUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 }),
  ]);
  clearTimeout(timer);
  assert.equal(response.status(), 200);
  assert.equal(socketUrl.host, baseUrl.host, "HMR must use the forwarded app origin, not a separate internal port.");
  assert.equal(socketUrl.protocol, baseUrl.protocol === "https:" ? "wss:" : "ws:");
  await page.locator("h1").waitFor();
  assert.equal(await page.locator("h1").count(), 1);
  console.log("PASS: mobile homepage loads and Vite connects through the same forwarded origin.");
} finally {
  clearTimeout(timer);
  await browser.close();
}
