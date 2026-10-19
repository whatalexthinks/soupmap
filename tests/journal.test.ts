import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { loadJournal } from "../src/journal/load.ts";
import { JOURNAL_CATEGORIES, parseArticle, validateJournal } from "../src/journal/content.ts";
import { renderMarkdown } from "../src/journal/markdown.ts";
import { journalDocument, journalFeed, journalPages } from "../src/render/journal.ts";

const articles = loadJournal();
const origin = "https://atlas.example";
const minimal = (extra = "", body = "Some text.") => `---
title: A test
dek: A short dek.
category: ramen
mark: 味噌
date: 2026-10-18
glance:
  - One: fact
  - Two: fact
  - Three: fact
further:
  - Ramen
${extra}---

${body}`;

test("the journal is broad: many articles in every topic", () => {
  assert.ok(articles.length >= 50, `${articles.length} articles`);
  for (const category of JOURNAL_CATEGORIES) {
    assert.ok(articles.filter(a => a.category === category.id).length >= 4, category.id);
  }
  assert.equal(new Set(articles.map(a => a.slug)).size, articles.length);
  assert.deepEqual(validateJournal(articles), []);
});

test("every article meets the writing guide", () => {
  for (const a of articles) {
    assert.ok(a.words >= 600 && a.words <= 1500, `${a.slug}: ${a.words} words`);
    assert.ok(a.dek.length <= 200, a.slug);
    assert.ok(a.further.length >= 1, a.slug);
    const sections = a.body.match(/^## /gm)?.length ?? 0;
    assert.ok(sections >= 3, `${a.slug}: ${sections} sections`);
    // Personal voice, but no invented visits or meals.
    assert.doesNotMatch(a.body, /\b(?:when|the first time|last (?:year|spring|summer|autumn|winter|week|month)) I (?:visited|went|ate|tried|was in|sat)\b/i, a.slug);
    // No prices: they date quickly and we can't verify them.
    assert.doesNotMatch(a.body, /[¥￥]\s?\d|\b\d[\d,]*\s?yen\b/i, a.slug);
  }
});

test("frontmatter mistakes fail the build with a useful message", () => {
  assert.ok(parseArticle("ok", minimal()));
  assert.throws(() => parseArticle("bad", minimal().replace("category: ramen", "category: pasta")), /unknown category/);
  assert.throws(() => parseArticle("bad", minimal("map: /somewhere\nmapLabel: Go\n")), /map must be/);
  assert.throws(() => parseArticle("bad", minimal("colour: red\n")), /unknown field/);
  assert.throws(() => parseArticle("bad", minimal().replace("mark: 味噌", "mark: miso")), /Japanese/);
  assert.throws(() => parseArticle("Bad_Slug", minimal()), /kebab/);
  assert.throws(() => parseArticle("bad", minimal("", "# A second title")), /only h1/);
  assert.equal(parseArticle("ok", minimal("map: /?q=okinawa soba\nmapLabel: Go\n")).map, "/map/?q=okinawa+soba");
  assert.deepEqual(validateJournal([parseArticle("ok", minimal("", "See [this](/journal/missing/) and [that](ftp://x)."))]),
    ["ok: link to missing page /journal/missing/", "ok: unsupported link ftp://x"]);
});

test("markdown is escaped and only safe links survive", () => {
  const html = renderMarkdown("Hi <script>alert(1)</script> [x](javascript:alert(1)) [map](/?q=iekei) [w](https://example.org) 味噌");
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(html.includes('<a href="/map/?q=iekei">map</a>'));
  assert.ok(html.includes('href="https://example.org" target="_blank" rel="noopener"'));
  assert.ok(html.includes('<span lang="ja">味噌</span>'));
});

test("pages have one title, canonical URLs, structured data and internal links that exist", async () => {
  const pages = journalPages(articles);
  assert.equal(pages.length, 1 + JOURNAL_CATEGORIES.length + articles.length);
  const paths = new Set(pages.map(p => p.path));
  const window = new Window();
  for (const page of pages) {
    const html = journalDocument(page, origin, articles, ["/assets/journal.css"]);
    const doc = new window.DOMParser().parseFromString(html, "text/html");
    assert.equal(doc.querySelectorAll("h1").length, 1, page.path);
    assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute("href"), origin + page.path);
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) JSON.parse(script.textContent ?? "");
    for (const a of doc.querySelectorAll("main a[href^='/journal/']")) {
      assert.ok(paths.has(a.getAttribute("href")!), `${page.path} → ${a.getAttribute("href")}`);
    }
    assert.equal(doc.querySelectorAll('script:not([type="application/ld+json"])').length, 0, "readable without JavaScript");
  }
  const article = pages.find(p => p.article)!;
  const html = journalDocument(article, origin, articles, []);
  assert.match(html, /"@type":"BlogPosting"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /property="og:type" content="article"/);
  await window.happyDOM.close();
});

test("the RSS feed lists every article", () => {
  const feed = journalFeed(articles, origin);
  assert.equal(feed.match(/<item>/g)?.length, articles.length);
  assert.match(feed, /<atom:link href="https:\/\/atlas\.example\/journal\/feed\.xml"/);
});
