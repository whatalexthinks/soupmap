import { restaurantSchema, absoluteSchema, schemaName } from '../growth/schema.ts';
import { mapBanner, weatherWidget, leadCapture, passportWidget, affiliateModule } from '../growth/render.ts';
import { isFeatured } from '../growth/config.ts';
import { siteHeader } from "./shell.ts";
/** Static documents: no map, client filters, or JavaScript needed to read them. */
import { directoryCard, directoryControls, profileHtml } from "./directory.ts";
import type { GuideLink } from "./guides.ts";
import type { Shop } from "../data/schema.ts";
import { CITIES } from "../data/cities.ts";
import { isIndexableShop, shopPath } from "../data/indexation.ts";
import { displayName } from "../names.ts";
import { CUISINES, cuisineOf } from "../cuisines.ts";
import { esc } from "../ui/dom.ts";
import { TOKYO_GUIDES } from "../data/editorial-notes.ts";

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_RANGE_SIZE = 25;
export interface CatalogPage {
  path: string;
  title: string;
  description: string;
  content: string;
  structuredData: Record<string, unknown>;
  /** Set by the quality gate (src/seo/quality.ts); index,follow when absent. */
  robots?: string;
  /** Site path of this page's share card; the site-wide card when absent. */
  image?: string;
}

const limitations = `<p>Coverage is incomplete. Reported locations are not independently checked recommendations. Check the shop before visiting; coordinates and current trading status may be inaccurate. Unknown menus, prices, hours and broth styles are not inferred.</p>
  <p>Generated Latin romanizations are approximate readings, not official English names. Original Japanese names are retained.</p>`;

function directoryRows(shops: readonly Shop[], _start: number): string {
  return `<ol class="directory-grid" id="directory-results">${shops.map(shop => directoryCard(shop)).join("")}</ol>`;
}

export function listingPath(base: string, page: number): string {
  return page === 1 ? base : `${base}page/${page}/`;
}

function rangePath(base: string, first: number): string {
  return `${base}range/${first}/`;
}

function listingPages(shops: readonly Shop[], base: string, label: string, all: readonly Shop[]): CatalogPage[] {
  const total = Math.ceil(shops.length / CATALOG_PAGE_SIZE);
  const ranges = total > CATALOG_RANGE_SIZE
    ? Array.from({ length: Math.ceil(total / CATALOG_RANGE_SIZE) }, (_, index) => {
      const first = index * CATALOG_RANGE_SIZE + 1;
      return { first, last: Math.min(first + CATALOG_RANGE_SIZE - 1, total) };
    }) : [];
  // Small directories link directly to their pages; larger ones use bounded hubs.
  const pageLinks = (first: number, last: number) => `<ul>${Array.from({ length: last - first + 1 }, (_, index) => {
    const page = first + index;
    return `<li><a href="${listingPath(base, page)}">Page ${page} — locations ${(page - 1) * CATALOG_PAGE_SIZE + 1}–${Math.min(page * CATALOG_PAGE_SIZE, shops.length)}</a></li>`;
  }).join("")}</ul>`;
  const rangeNavigation = ranges.length
    ? `<nav aria-label="Catalog page ranges"><h2>Browse all ${total} pages</h2><ul>${ranges.map(({ first, last }) =>
      `<li><a href="${rangePath(base, first)}">Pages ${first}–${last}</a></li>`).join("")}</ul></nav>`
    : total > 1 ? `<nav aria-label="Catalog page index"><h2>Browse all ${total} pages</h2>${pageLinks(1, total)}</nav>` : "";
  const pages: CatalogPage[] = Array.from({ length: total }, (_, index) => {
    const page = index + 1;
    const start = index * CATALOG_PAGE_SIZE;
    const slice = shops.slice(start, start + CATALOG_PAGE_SIZE);
    const local = CITIES.find(c => c.name === label);
    // A forecast needs a place: city pages use the city centre; all of Japan has no single sky.
    const heroGrowth = `${mapBanner(undefined, label)}${local ? weatherWidget({ lat: local.lat, lng: local.lng, city: local.name }) : ""}`;
    const growth = `${leadCapture(undefined, label)}${passportWidget(local?.name ?? "Tokyo")}${affiliateModule()}`;
    const path = listingPath(base, page);
    const heading = `${label} soup shop catalog${page > 1 ? ` — Page ${page}` : ""}`;
    const description = `Browse ${label} soup shop locations, ${start + 1}–${start + slice.length} of ${shops.length}. Names, reported coordinates, sources and verification status in Soupmap's Japan pilot.`;
    return {
      path, title: `${heading} · Soupmap`, description,
      content: `<section class="directory-hero"><div><span class="directory-kicker">The soup directory / Japan, chapter one</span><h1 data-directory-heading>${label === 'Japan' ? 'The next bowl<br>is out there.' : `${esc(label)}.<br>One bowl away.`}</h1><p class="lede">A place for every craving. Browse the guide, check the details, and keep the ones you want to try.</p></div><aside class="directory-hero__aside"><strong data-directory-total>${shops.length.toLocaleString('en-US')}</strong><p>places to explore in <span data-directory-region>${esc(label)}</span>.</p><p>Soupmap selections sit alongside open-data listings. Every record shows its source.</p></aside></section>${heroGrowth}
        <nav class="directory-cities" aria-label="Featured cities"><a href="/catalog/"${base === '/catalog/' ? ' aria-current="page"' : ''}>All Japan</a>${CITIES.filter(c=>all.some(s=>s.city===c.name)).map(c=>`<a href="/city/${c.slug}/"${base === `/city/${c.slug}/` ? ' aria-current="page"' : ''}>${esc(c.name)}<span lang="ja">${esc(c.nameJa)}</span></a>`).join('')}</nav>
        ${page === 1 && (base === "/catalog/" || base === "/city/tokyo/") ? `<section class="directory-workflow" aria-label="Tokyo soup guides"><span>Start with a useful guide</span>${TOKYO_GUIDES.map(g => `<a href="/journal/${g.slug}/">${esc(g.label)} ↗</a>`).join("")}</section>` : ""}
        <nav class="directory-workflow" aria-label="Your discoveries"><span>Find a place. Keep a plan.</span><a href="/guides/">City guides ↗</a><a href="/catalog/?collection=saved">Saved places ↗</a><a href="/me/#plan">Plan a trip ↗</a></nav>
        <div class="directory-workspace" id="directory-browser" data-city="${CITIES.find(c=>base===`/city/${c.slug}/`)?.slug ?? 'all'}" data-page="${page}">
        ${directoryControls(CITIES.find(c=>base===`/city/${c.slug}/`)?.slug ?? 'all')}
        <div class="directory-feed"><div class="directory-collections" hidden aria-label="Quick collections"><a href="?collection=all" data-directory-collection="all">All places</a><a href="?collection=editorial" data-directory-collection="editorial">Our selections</a><a href="?collection=saved" data-directory-collection="saved">Saved places</a></div><div class="directory-active" id="directory-active" aria-label="Active filters"></div>
        <p class="directory-status" data-directory-status role="status"></p>
        <div class="directory-result-bar"><p id="directory-count" aria-live="polite">Showing ${start + 1}–${start + slice.length} of ${shops.length.toLocaleString('en-US')} places</p><span>Selections first · More to discover below</span><div class="directory-views" hidden aria-label="Results layout"><button type="button" data-directory-view="grid" aria-pressed="true" aria-label="Card view">Grid</button><button type="button" data-directory-view="list" aria-pressed="false" aria-label="List view">List</button></div></div>
        ${directoryRows(slice, start)}
        <nav class="directory-pagination" id="directory-pagination" aria-label="Catalog pages">
          ${page > 1 ? `<a rel="prev" href="${listingPath(base, page - 1)}">← Previous page</a>` : ""}
          <span>Page ${page} of ${total}</span>
          ${page < total ? `<a rel="next" href="${listingPath(base, page + 1)}">Next page →</a>` : ""}
          ${page > 2 ? `<a href="${base}">First page</a>` : ""}
        </nav></div></div>
        <details class="directory-page-index"><summary>Browse the complete page index</summary>${rangeNavigation}</details>
        ${growth}<details class="directory-notice"><summary>About the data in this guide</summary>${limitations}</details>`,
      structuredData: {
        "@type": "CollectionPage", name: heading, description,
        mainEntity: { "@type": "ItemList", itemListElement: slice.map(shop => ({
          "@type": "ListItem", position: start + slice.indexOf(shop) + 1, name: schemaName(shop), url: isIndexableShop(shop) ? shopPath(shop) : `/catalog/?place=${shop.slug}`, item: restaurantSchema(shop),
        })) },
      },
    };
  });
  for (const { first, last } of ranges) {
    const heading = `${label} soup shop catalog — Pages ${first}–${last}`;
    const start = (first - 1) * CATALOG_PAGE_SIZE;
    const end = Math.min(last * CATALOG_PAGE_SIZE, shops.length);
    const description = `Browse pages ${first}–${last} of the ${label} soup shop catalog, covering locations ${start + 1}–${end} of ${shops.length}. Each page lists up to ${CATALOG_PAGE_SIZE} reported locations with names, sources and verification status.`;
    pages.push({
      path: rangePath(base, first), title: `${heading} · Soupmap`, description,
      content: `<nav aria-label="Breadcrumb"><a href="/catalog/">Japan catalog</a>${base !== "/catalog/" ? ` / <a href="${base}">${esc(label)} catalog</a>` : ""}</nav>
        <h1>${esc(heading)}</h1><p class="lede">${esc(description)}</p>
        <nav aria-label="Catalog pages in this range">${pageLinks(first, last)}</nav>
        ${mapBanner(undefined,label)}${leadCapture(undefined,label)}${passportWidget(CITIES.find(c=>c.name===label)?.name ?? "Tokyo")}
        ${limitations}
        <p><a href="${base}">Browse all ${esc(label)} catalog page ranges</a></p>`,
      structuredData: {
        "@type": "CollectionPage", name: heading, description,
        mainEntity: { "@type": "ItemList", itemListElement: Array.from({ length: last - first + 1 }, (_, index) => ({
          "@type": "ListItem", position: first + index, name: `${label} catalog — Page ${first + index}`,
          url: listingPath(base, first + index),
        })) },
      },
    });
  }
  return pages;
}

/** "Yoshimuraya — Iekei ramen in Okano, Yokohama": the bowl people search for, and where. */
export function restaurantTitle(shop: Shop, name: string): string {
  const bowl = shop.signatureBowl.replace(/\s*\([^)]*\)/g, "");
  const options = [`${name} — ${bowl} in ${shop.neighborhood}, ${shop.city}`, `${name} — ${bowl} in ${shop.city}`, `${name}, ${shop.city}`];
  return `${options.find(title => title.length <= 60) ?? options.at(-1)} · Soupmap`;
}

/** Search snippets lead with our own notes; the verification status stays on the page itself. */
export function restaurantDescription(shop: Shop, name: string): string {
  return `${name}${shop.nameJa !== name ? ` (${shop.nameJa})` : ""} in ${shop.neighborhood}, ${shop.city}. ${shop.blurb.trim()}`;
}

export function catalogPages(shops: readonly Shop[], guides: ReadonlyMap<string, readonly GuideLink[]> = new Map()): CatalogPage[] {
  const pages = listingPages(shops, "/catalog/", "Japan", shops);
  for (const city of CITIES) {
    const records = shops.filter(s => s.city === city.name).sort((a,b) => Number(isFeatured(b.slug)) - Number(isFeatured(a.slug)));
    if (records.length) pages.push(...listingPages(records, `/city/${city.slug}/`, city.name, shops));
  }
  for (const shop of shops.filter(isIndexableShop)) {
    const name = displayName(shop, "en");
    const path = shopPath(shop);
    const description = restaurantDescription(shop, name);
    const city = CITIES.find(c => c.name === shop.city);
    pages.push({
      path, title: restaurantTitle(shop, name), description,
      content: `<nav aria-label="Breadcrumb"><a href="/catalog/">Japan catalog</a>${city ? ` / <a href="/city/${city.slug}/">${esc(city.name)}</a>` : ""}</nav>${profileHtml(shop, guides.get(shop.slug))}<p class="directory-status" data-directory-status role="status"></p>`,
      structuredData: { "@type": "WebPage", name: `${name} — ${shop.city}`, description, inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: "Soupmap" },
        keywords: [CUISINES.find(c => c.id === cuisineOf(shop))!.label, shop.city, shop.neighborhood].join(", "),
        breadcrumb: { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Japan catalog", item: "/catalog/" },
          ...(city ? [{ "@type": "ListItem", position: 2, name: city.name, item: `/city/${city.slug}/` }] : []),
          { "@type": "ListItem", position: city ? 3 : 2, name, item: path }] },
        mainEntity: restaurantSchema(shop), about: restaurantSchema(shop),
        publisher: { "@type": "Organization", name: "Soupmap", url: "/" } },
    });
  }
  return pages;
}

export function catalogDocument(page: CatalogPage, siteUrl: string, stylesheet: string | readonly string[], script?: string): string {
  const canonical = `${siteUrl}${page.path}`;
  const data = absoluteSchema({ "@context": "https://schema.org", ...structuredClone(page.structuredData), url: canonical }, siteUrl);
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}">
    <link rel="canonical" href="${esc(canonical)}"><meta name="robots" content="${esc(page.robots ?? "index,follow")}">
    <meta property="og:type" content="website"><meta property="og:site_name" content="Soupmap">
    <meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}">
    <meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(siteUrl)}${esc(page.image ?? "/social/soupmap-share.png")}">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}">
    <meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${esc(siteUrl)}${esc(page.image ?? "/social/soupmap-share.png")}">
    <link rel="icon" href="/favicon.svg"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest">${(typeof stylesheet === "string" ? [stylesheet] : stylesheet).map(href => `<link rel="stylesheet" href="${esc(href)}">`).join("")}
    <script type="application/ld+json">${json}</script>${script ? `<script type="module" src="${esc(script)}"></script>` : ""}</head><body class="directory-page">
    <a class="skip-link" href="#main">Skip to content</a>
    ${siteHeader("discover", "directory-account")}
    <main id="main" class="page">${page.content}</main><dialog class="place-dialog" id="place-dialog" aria-label="Restaurant profile"><div class="place-dialog__bar"><a id="place-permalink" href="/catalog/">Open full profile ↗</a><button type="button" id="place-close" aria-label="Close restaurant profile">Close ×</button></div><div id="place-dialog-content"></div></dialog>
    <footer class="foot"><p class="growth-citation" itemscope itemtype="https://schema.org/CreativeWork"><span itemprop="publisher">Soupmap</span> · Cite this guide: <a itemprop="url" href="${esc(canonical)}">${esc(page.title)}</a>. Location data retains its original source attribution. <a href="/llms.txt">AI citation guide</a></p><p>Soupmap · A worldwide soup atlas, starting in Japan. <a href="/catalog/">Catalog</a> · <a href="/journal/">Journal</a> · <a href="/credits/">Data &amp; credits</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></p></footer>
    </body></html>`;
}
