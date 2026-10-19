/**
 * The Soup Journal's static pages: index, topic pages, articles and an RSS feed.
 * Plain HTML and CSS, readable without JavaScript, with canonical URLs and structured data.
 */
import { esc } from "../ui/dom.ts";
import { JOURNAL_CATEGORIES, categoryById, relatedArticles, type Article, type JournalCategory } from "../journal/content.ts";
import { renderMarkdown, tagJapanese } from "../journal/markdown.ts";

export const JOURNAL_NAME = "Soupmap Journal";
export const JOURNAL_SUBTITLE = "Notes from the steam";
export const JOURNAL_SUBTITLE_JA = "湯気の記";
const DESCRIPTION = "Essays and field notes on ramen, noodles and the soups of the world: how they're made, where they come from, and how to eat them well.";
/** Shown first on the index when present. */
const FEATURED = ["regional-ramen-map", "four-ramen-flavours", "slurping-etiquette", "dashi", "pho", "ramen-history"];

export interface JournalPage {
  path: string;
  title: string;
  description: string;
  type: "website" | "article";
  /** Inner <main> HTML. */
  main: string;
  article?: Article;
}

export const articlePath = (slug: string) => `/journal/${slug}/`;
export const topicPath = (id: string) => `/journal/topic/${id}/`;

const dateText = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${iso}T00:00:00Z`));

function wikipedia(title: string): string {
  // Special:Search with go=Go opens the article when the title exists and never 404s.
  return `https://en.wikipedia.org/wiki/Special:Search?go=Go&search=${encodeURIComponent(title).replace(/%20/g, "+")}`;
}

/** Articles in display order: category order, featured first, then by title. */
export function orderArticles(articles: readonly Article[]): Article[] {
  const rank = new Map(JOURNAL_CATEGORIES.map((c, i) => [c.id, i]));
  const featured = (a: Article) => { const i = FEATURED.indexOf(a.slug); return i < 0 ? 99 : i; };
  return [...articles].sort((a, b) => (rank.get(a.category)! - rank.get(b.category)!)
    || featured(a) - featured(b) || a.title.localeCompare(b.title));
}

const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/;

/**
 * Vertical Japanese, one stacked character at a time. writing-mode alone breaks when the
 * browser has to fall back from a Latin font (common on Android): kanji overlap. Stacking
 * spans works in any font; the long-vowel mark turns and small kana sit up and to the right.
 */
export function verticalText(text: string): string {
  return [...text].map(ch => `<span${/[ー〜～]/.test(ch) ? ' class="v-turn"' : SMALL_KANA.test(ch) ? ' class="v-small"' : ""}>${esc(ch)}</span>`).join("");
}

/** Katakana names of foreign dishes run long (オニオンスープ); set them smaller. */
const markClass = (mark: string) => [...mark].length > 4 ? " is-long" : "";

function card(article: Article, size: "lg" | "md" = "md"): string {
  const category = categoryById.get(article.category)!;
  return `<article class="j-card j-card--${size}">
    <a class="j-card__link" href="${articlePath(article.slug)}">
      <span class="j-card__mark j-v${markClass(article.mark)}" lang="ja" aria-hidden="true">${verticalText(article.mark)}</span>
      <span class="j-card__body">
        <span class="j-eyebrow">${esc(category.name)}</span>
        <span class="j-card__title">${tagJapanese(esc(article.title))}</span>
        <span class="j-card__dek">${tagJapanese(esc(article.dek))}</span>
        <span class="j-card__meta">${article.readingMinutes} min read</span>
      </span>
    </a>
  </article>`;
}

function topicNav(current?: string): string {
  return `<nav class="j-topics" aria-label="Journal topics"><ul>${JOURNAL_CATEGORIES.map(c =>
    `<li><a href="${topicPath(c.id)}"${c.id === current ? ' aria-current="page"' : ""}><span lang="ja" aria-hidden="true">${esc(c.mark)}</span>${esc(c.name)}</a></li>`).join("")}</ul></nav>`;
}

const organization = (siteUrl: string) => ({ "@type": "Organization", name: "Soupmap", url: `${siteUrl}/`,
  logo: { "@type": "ImageObject", url: `${siteUrl}/icon-512.png` } });

export function journalIndexPage(articles: readonly Article[]): JournalPage {
  const ordered = orderArticles(articles);
  const featured = FEATURED.map(slug => ordered.find(a => a.slug === slug)).find(Boolean) ?? ordered[0];
  const sections = JOURNAL_CATEGORIES.map(category => {
    const items = ordered.filter(a => a.category === category.id);
    if (!items.length) return "";
    return `<section class="j-section" aria-labelledby="topic-${category.id}">
      <header class="j-section__head">
        <span class="j-section__mark j-v" lang="ja" aria-hidden="true">${verticalText(category.mark)}</span>
        <div><h2 id="topic-${category.id}"><a href="${topicPath(category.id)}">${esc(category.name)}</a></h2>
        <p>${esc(category.description)}</p></div>
        <a class="j-section__all" href="${topicPath(category.id)}">All ${items.length} <span aria-hidden="true">→</span></a>
      </header>
      <div class="j-grid">${items.slice(0, 6).map(a => card(a)).join("")}</div>
    </section>`;
  }).join("");
  return {
    path: "/journal/", title: `${JOURNAL_NAME} — ${JOURNAL_SUBTITLE}`, description: DESCRIPTION, type: "website",
    main: `<section class="j-hero">
        <svg class="j-enso" viewBox="0 0 120 120" aria-hidden="true"><path d="M92 26C78 13 55 11 38 21 18 33 11 59 21 80c10 20 35 30 57 24 21-6 34-26 31-48-1-8-4-15-9-21"/></svg>
        <p class="j-eyebrow">${esc(JOURNAL_NAME)}</p>
        <h1 class="j-hero__title">${esc(JOURNAL_SUBTITLE)}</h1>
        <p class="j-hero__ja j-v" lang="ja">${verticalText(JOURNAL_SUBTITLE_JA)}</p>
        <p class="j-lede">${esc(DESCRIPTION)}</p>
        <p class="j-hero__count">${articles.length} essays · ${JOURNAL_CATEGORIES.filter(c => articles.some(a => a.category === c.id)).length} topics</p>
      </section>
      ${topicNav()}
      ${featured ? `<section class="j-featured" aria-label="Featured">${card(featured, "lg")}</section>` : ""}
      ${sections}`,
  };
}

export function journalTopicPage(category: JournalCategory, articles: readonly Article[]): JournalPage {
  const items = orderArticles(articles.filter(a => a.category === category.id));
  return {
    path: topicPath(category.id), title: `${category.name} · ${JOURNAL_NAME}`, description: category.description, type: "website",
    main: `<nav class="j-crumbs" aria-label="Breadcrumb"><a href="/journal/">Journal</a><span aria-hidden="true">／</span><span aria-current="page">${esc(category.name)}</span></nav>
      <header class="j-topic">
        <span class="j-topic__mark j-v" lang="ja" aria-hidden="true">${verticalText(category.mark)}</span>
        <p class="j-eyebrow">Topic</p>
        <h1>${esc(category.name)}</h1>
        <p class="j-lede">${esc(category.description)}</p>
      </header>
      ${topicNav(category.id)}
      <div class="j-grid j-grid--topic">${items.map(a => card(a)).join("")}</div>`,
  };
}

export function journalArticlePage(article: Article, all: readonly Article[]): JournalPage {
  const category = categoryById.get(article.category)!;
  const related = relatedArticles(article, all);
  return {
    path: articlePath(article.slug), title: `${article.title} · ${JOURNAL_NAME}`, description: article.dek, type: "article", article,
    main: `<article class="j-article">
      <nav class="j-crumbs" aria-label="Breadcrumb"><a href="/journal/">Journal</a><span aria-hidden="true">／</span><a href="${topicPath(category.id)}">${esc(category.name)}</a></nav>
      <header class="j-article__head">
        <span class="j-article__mark j-v${markClass(article.mark)}" lang="ja" aria-hidden="true">${verticalText(article.mark)}</span>
        <p class="j-eyebrow"><a href="${topicPath(category.id)}">${esc(category.name)}</a></p>
        <h1>${tagJapanese(esc(article.title))}</h1>
        <p class="j-dek">${tagJapanese(esc(article.dek))}</p>
        <p class="j-meta"><time datetime="${article.date}">${dateText(article.date)}</time><span aria-hidden="true">·</span>${article.readingMinutes} min read<span aria-hidden="true">·</span>${esc(JOURNAL_NAME)}</p>
      </header>
      <aside class="j-glance" aria-labelledby="glance-title">
        <h2 id="glance-title">At a glance</h2>
        <dl>${article.glance.map(g => `<dt>${tagJapanese(esc(g.label))}</dt><dd>${tagJapanese(esc(g.value))}</dd>`).join("")}</dl>
      </aside>
      <div class="j-prose">${renderMarkdown(article.body)}</div>
      ${article.map ? `<p class="j-mapcta"><a href="${esc(article.map)}"><span class="j-mapcta__seal" aria-hidden="true">湯</span>${esc(article.mapLabel ?? "Find it on the map")}<span aria-hidden="true">→</span></a></p>` : ""}
      <footer class="j-article__foot">
        <section aria-labelledby="further-title"><h2 id="further-title">Further reading</h2>
          <ul>${article.further.map(t => `<li><a href="${esc(wikipedia(t))}" target="_blank" rel="noopener">${esc(t)} <span class="j-ext">Wikipedia ↗</span></a></li>`).join("")}</ul>
        </section>
        <p class="j-note">Written by the Soupmap editors from widely published sources. Origin stories in food are often legends; we say so when they are. Spotted an error? Tell us and we'll fix it.</p>
      </footer>
    </article>
    ${related.length ? `<section class="j-related" aria-labelledby="related-title"><h2 id="related-title">Keep reading</h2><div class="j-grid">${related.map(a => card(a)).join("")}</div></section>` : ""}`,
  };
}

export function journalPages(articles: readonly Article[]): JournalPage[] {
  return [
    journalIndexPage(articles),
    ...JOURNAL_CATEGORIES.filter(c => articles.some(a => a.category === c.id)).map(c => journalTopicPage(c, articles)),
    ...orderArticles(articles).map(a => journalArticlePage(a, articles)),
  ];
}

function structuredData(page: JournalPage, siteUrl: string, articles: readonly Article[]): Record<string, unknown>[] {
  const url = `${siteUrl}${page.path}`;
  const crumbs = [{ name: "Journal", path: "/journal/" }];
  if (page.article) {
    const category = categoryById.get(page.article.category)!;
    crumbs.push({ name: category.name, path: topicPath(category.id) }, { name: page.article.title, path: page.path });
    return [{
      "@context": "https://schema.org", "@type": "BlogPosting", headline: page.article.title, description: page.article.dek,
      datePublished: page.article.date, dateModified: page.article.date, inLanguage: "en", articleSection: category.name,
      wordCount: page.article.words, url, mainEntityOfPage: url, image: `${siteUrl}/social/soupmap-world.png`,
      author: organization(siteUrl), publisher: organization(siteUrl),
      isPartOf: { "@type": "Blog", name: JOURNAL_NAME, url: `${siteUrl}/journal/` },
    }, breadcrumbs(crumbs, siteUrl)];
  }
  if (page.path === "/journal/") {
    return [{
      "@context": "https://schema.org", "@type": "Blog", name: JOURNAL_NAME, description: DESCRIPTION, url, inLanguage: "en",
      publisher: organization(siteUrl),
      blogPost: orderArticles(articles).map(a => ({ "@type": "BlogPosting", headline: a.title, url: `${siteUrl}${articlePath(a.slug)}`, datePublished: a.date })),
    }];
  }
  const category = JOURNAL_CATEGORIES.find(c => topicPath(c.id) === page.path)!;
  crumbs.push({ name: category.name, path: page.path });
  return [{
    "@context": "https://schema.org", "@type": "CollectionPage", name: page.title, description: page.description, url,
    mainEntity: { "@type": "ItemList", itemListElement: orderArticles(articles.filter(a => a.category === category.id))
      .map((a, i) => ({ "@type": "ListItem", position: i + 1, url: `${siteUrl}${articlePath(a.slug)}`, name: a.title })) },
  }, breadcrumbs(crumbs, siteUrl)];
}

function breadcrumbs(items: { name: string; path: string }[], siteUrl: string): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, i) =>
    ({ "@type": "ListItem", position: i + 1, name: item.name, item: `${siteUrl}${item.path}` })) };
}

/** <head> contents after the stylesheet: metadata, social cards, feed and structured data. */
export function journalHead(page: JournalPage, siteUrl: string, articles: readonly Article[]): string {
  const url = `${siteUrl}${page.path}`;
  const image = `${siteUrl}/social/soupmap-world.png`;
  const json = structuredData(page, siteUrl, articles).map(data =>
    `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`).join("");
  return `<meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(page.title)}</title>
    <meta name="description" content="${esc(page.description)}" />
    <link rel="canonical" href="${esc(url)}" /><meta name="robots" content="index,follow" />
    <meta name="theme-color" content="#f6f3ea" /><meta name="color-scheme" content="light" />
    <meta property="og:type" content="${page.type}" /><meta property="og:site_name" content="Soupmap" />
    <meta property="og:title" content="${esc(page.title)}" /><meta property="og:description" content="${esc(page.description)}" />
    <meta property="og:url" content="${esc(url)}" /><meta property="og:image" content="${esc(image)}" />
    <meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" />
    ${page.article ? `<meta property="article:published_time" content="${page.article.date}" /><meta property="article:section" content="${esc(categoryById.get(page.article.category)!.name)}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${esc(page.title)}" />
    <meta name="twitter:description" content="${esc(page.description)}" /><meta name="twitter:image" content="${esc(image)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" /><link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="alternate" type="application/rss+xml" title="${esc(JOURNAL_NAME)}" href="${esc(siteUrl)}/journal/feed.xml" />
    ${json}`;
}

export function journalBody(page: JournalPage): string {
  return `<a class="skip-link" href="#main">Skip to content</a>
    <header class="j-head">
      <a class="j-brand" href="/journal/"><span class="j-seal" aria-hidden="true">湯</span><span>soupmap <em>journal</em></span></a>
      <nav class="j-head__nav" aria-label="Site"><a href="/journal/"${page.path === "/journal/" ? ' aria-current="page"' : ""}>Journal</a><a href="/">Map</a><a href="/catalog/">Catalog</a></nav>
    </header>
    <main id="main" class="j-main">${page.main}</main>
    <footer class="j-foot">
      <div class="j-wave" aria-hidden="true"></div>
      <p class="j-foot__ja" lang="ja">${esc(JOURNAL_SUBTITLE_JA)}</p>
      <p>${esc(JOURNAL_NAME)} · ${esc(JOURNAL_SUBTITLE)}</p>
      <p class="j-foot__links"><a href="/journal/">Journal</a><a href="/">The map</a><a href="/catalog/">Japan catalog</a><a href="/journal/feed.xml">RSS</a><a href="/credits/">Data &amp; credits</a></p>
    </footer>`;
}

/** A complete document for generated pages (the index comes from journal/index.html). */
export function journalDocument(page: JournalPage, siteUrl: string, articles: readonly Article[], stylesheets: readonly string[]): string {
  return `<!doctype html><html lang="en"><head>${journalHead(page, siteUrl, articles)}
    ${stylesheets.map(href => `<link rel="stylesheet" href="${esc(href)}" />`).join("")}</head>
    <body class="journal">${journalBody(page)}</body></html>`;
}

export function journalFeed(articles: readonly Article[], siteUrl: string): string {
  const items = orderArticles(articles).map(a => `    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(`${siteUrl}${articlePath(a.slug)}`)}</link>
      <guid isPermaLink="true">${esc(`${siteUrl}${articlePath(a.slug)}`)}</guid>
      <description>${esc(a.dek)}</description>
      <category>${esc(categoryById.get(a.category)!.name)}</category>
      <pubDate>${new Date(`${a.date}T00:00:00Z`).toUTCString()}</pubDate>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(JOURNAL_NAME)}</title>
    <link>${esc(siteUrl)}/journal/</link>
    <atom:link href="${esc(siteUrl)}/journal/feed.xml" rel="self" type="application/rss+xml" />
    <description>${esc(DESCRIPTION)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}
