import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadJournal } from "../src/journal/load.ts";
import { TOKYO_GUIDES, EDITORIAL_NOTES } from "../src/data/editorial-notes.ts";
import { ORDERED_SHOPS } from "../src/data/shops.ts";
import { catalogPages } from "../src/render/catalog.ts";
import { profileHtml } from "../src/render/directory.ts";
import { renderMarkdown } from "../src/journal/markdown.ts";
import { journalPages } from "../src/render/journal.ts";

const articles = loadJournal();
const catalog = catalogPages(ORDERED_SHOPS);
const journal = journalPages(articles);
const paths = new Set([...catalog.map(p => p.path), ...journal.map(p => p.path), "/", "/me/", "/map/"]);

test("Tokyo cluster has three substantial, interlinked static articles", () => {
  for (const guide of TOKYO_GUIDES) {
    const article = articles.find(a => a.slug === guide.slug)!;
    assert.ok(article, guide.slug);
    assert.ok(article.words >= 700 && article.words <= 1100, `${guide.slug}: ${article.words} words`);
    const html = renderMarkdown(article.body);
    for (const match of html.matchAll(/href="(\/[^"#?]*)"/g)) assert.ok(paths.has(match[1]!), `Broken internal link ${match[1]}`);
    assert.match(html, /https:\/\/(?:afuri\.com|www\.tokyoeki-1bangai\.co\.jp)/);
    assert.match(html, /not a|not medical|not a report|not a route/i);
  }
});

test("Tokyo guides are discoverable from home, city and national directory", () => {
  for (const guide of TOKYO_GUIDES) {
    const link = `href="/journal/${guide.slug}/"`;
    assert.ok(readFileSync("index.html", "utf8").includes(link));
    for (const path of ["/city/tokyo/", "/catalog/"]) assert.ok(catalog.find(p => p.path === path)!.content.includes(link));
    assert.ok(journal.find(p => p.path === "/journal/")!.main.includes(link));
  }
});

test("eight researched profiles show sources without inventing on-site verification", () => {
  assert.equal(Object.keys(EDITORIAL_NOTES).length, 8);
  for (const [slug, note] of Object.entries(EDITORIAL_NOTES)) {
    const shop = ORDERED_SHOPS.find(s => s.slug === slug)!;
    assert.ok(shop, slug);
    const html = profileHtml(shop);
    assert.ok(html.includes("Source research, not an on-site visit."));
    assert.ok(html.includes(note.checked));
    for (const source of note.sources) assert.ok(html.includes(source.url));
    for (const guide of note.guides) assert.ok(articles.some(a => a.slug === guide.slug), guide.slug);
    assert.equal(shop.verified, false);
  }
  const closed = ORDERED_SHOPS.find(s => s.slug === "honke-owariya")!;
  assert.match(profileHtml(closed), /Restaurant service suspended/);
  assert.match(closed.blurb, /suspension/);
  assert.doesNotMatch(closed.blurb, /Order the/);
});
