/**
 * Validate the actual emitted documents, not just render functions.
 * Run after a production build: npm run seo:check.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("dist");
const sitemap = await readFile(resolve(root, "sitemap.xml"), "utf8");
const robots = await readFile(resolve(root, "robots.txt"), "utf8");
const locations = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]!.replaceAll("&amp;", "&"));
// The newer SEO graph emits a sitemap index; validate its segments, not XML as HTML.
const urls: string[] = [];
const visited = new Set<string>();
async function collect(xml: string): Promise<void> {
  if (!xml.includes("<sitemapindex")) { urls.push(...locations(xml)); return; }
  for (const value of locations(xml)) {
    const url = new URL(value);
    const file = resolve(root, `.${url.pathname}`);
    if (!file.startsWith(root + "/") || visited.has(file)) throw new Error("Unsafe or repeated sitemap segment.");
    visited.add(file);
    await collect(await readFile(file, "utf8"));
  }
}
await collect(sitemap);
const errors: string[] = [];
if (!sitemap.startsWith("<?xml") || !urls.length) errors.push("Sitemap must be non-empty XML.");
if (new Set(urls).size !== urls.length) errors.push("Duplicate sitemap URLs.");
if (!/^User-agent: \*/m.test(robots) || !/^Sitemap: https:\/\//m.test(robots)) errors.push("Missing robots directives.");
const titles = new Map<string, string>();
const descriptions = new Map<string, string>();
for (const value of urls) {
  const url = new URL(value);
  if (url.search || url.hash || !url.pathname.endsWith("/")) errors.push(`Non-canonical sitemap URL: ${value}`);
  if (/^\/(?:me|account|sign-in|sign-up)(?:\/|$)/.test(url.pathname)) errors.push(`Private workflow in sitemap: ${value}`);
  const file = resolve(root, `.${url.pathname}`, "index.html");
  if (!file.startsWith(root + "/")) throw new Error("Unsafe sitemap path.");
  let html: string;
  try { html = await readFile(file, "utf8"); }
  catch { errors.push(`Missing emitted document: ${url.pathname}`); continue; }
  const canonical = html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1];
  if (canonical !== value) errors.push(`Canonical mismatch: ${url.pathname}`);
  if (/<meta\b[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html)) errors.push(`Noindex page in sitemap: ${url.pathname}`);
  if ((html.match(/<h1(?:\s|>)/g) ?? []).length !== 1) errors.push(`Expected one rendered h1: ${url.pathname}`);
  for (const [label, text, seen] of [
    ["title", html.match(/<title>([^<]+)<\/title>/)?.[1], titles],
    ["description", html.match(/<meta\b[^>]*name="description"[^>]*content="([^"]+)"/)?.[1], descriptions],
  ] as const) {
    if (!text) errors.push(`Missing ${label}: ${url.pathname}`);
    else if (seen.has(text)) errors.push(`Duplicate ${label}: ${url.pathname} and ${seen.get(text)}`);
    else seen.set(text, url.pathname);
  }
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]!); } catch { errors.push(`Invalid structured data: ${url.pathname}`); }
  }
  if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(html)) errors.push(`Merge markers in ${url.pathname}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else console.log(`SEO build check passed: ${urls.length} canonical HTML pages, unique titles/descriptions, valid JSON-LD, robots and sitemap.`);
