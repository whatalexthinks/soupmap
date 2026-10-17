/** Static documents: no map, client filters, or JavaScript needed to read them. */
import type { Shop } from "../data/schema.ts";
import { CITIES } from "../data/cities.ts";
import { BROTHS } from "../data/broths.ts";
import { isIndexableShop, shopPath } from "../data/indexation.ts";
import { displayName, isRomanizedName } from "../names.ts";
import { getSource } from "../sources.ts";
import { esc } from "../ui/dom.ts";

export const CATALOG_PAGE_SIZE = 100;
export interface CatalogPage {
  path: string;
  title: string;
  description: string;
  content: string;
  structuredData: Record<string, unknown>;
}

function provenance(shop: Shop): string {
  const source = shop.dataSource === "manual" ? null
    : getSource(shop.dataSource === "overture" ? "overture-places" : "osm-overpass");
  return `${source ? `<a href="${esc(source.attributionUrl)}">${esc(source.attribution)}</a>` : "Manually entered location"}
    ${shop.sourceId ? ` · Source ID: ${esc(shop.sourceId)}` : ""}
    ${shop.sourceLicenses?.length ? ` · Source licenses: ${esc(shop.sourceLicenses.join(", "))}` : ""}
    ${shop.dataSource === "osm" ? " · ODbL" : ""}`;
}

function names(shop: Shop): string {
  return `${esc(displayName(shop, "en"))}${shop.nameJa !== displayName(shop, "en") ? ` <span lang="ja">(${esc(shop.nameJa)})</span>` : ""}`;
}

const limitations = `<p>Coverage is incomplete. Reported locations are not independently checked recommendations. Check the shop before visiting; coordinates and current trading status may be inaccurate. Unknown menus, prices, hours and broth styles are not inferred.</p>
  <p>Generated Latin romanizations are approximate readings, not official English names. Original Japanese names are retained.</p>`;

function cityLinks(shops: readonly Shop[]): string {
  return `<nav aria-label="Featured cities"><ul>${CITIES.filter(c => shops.some(s => s.city === c.name)).map(c =>
    `<li><a href="/city/${c.slug}/">${esc(c.name)} <span lang="ja">${esc(c.nameJa)}</span></a></li>`).join("")}</ul></nav>`;
}

function directoryRows(shops: readonly Shop[], start: number): string {
  return `<ol start="${start + 1}">${shops.map(shop => `<li class="source">
    <h2><a href="${esc(shopPath(shop))}">${names(shop)}</a></h2>
    <p>${esc(shop.city)} · ${esc(shop.neighborhood)} · ${shop.lat.toFixed(5)}, ${shop.lng.toFixed(5)}</p>
    <p>${isIndexableShop(shop) ? esc(shop.blurb) : "Open-data location only. Menu, prices, opening hours and current trading status have not been independently verified."}</p>
    <p>${shop.verified ? "Verified on the ground." : "Unverified location."} ${provenance(shop)}</p>
    ${!isIndexableShop(shop) ? "<p>Basic listing: the name opens this location on the interactive map, not a standalone shop page.</p>" : ""}
  </li>`).join("")}</ol>`;
}

export function listingPath(base: string, page: number): string {
  return page === 1 ? base : `${base}page/${page}/`;
}

function listingPages(shops: readonly Shop[], base: string, label: string, all: readonly Shop[]): CatalogPage[] {
  const total = Math.ceil(shops.length / CATALOG_PAGE_SIZE);
  return Array.from({ length: total }, (_, index) => {
    const page = index + 1;
    const start = index * CATALOG_PAGE_SIZE;
    const slice = shops.slice(start, start + CATALOG_PAGE_SIZE);
    const path = listingPath(base, page);
    const heading = `${label} soup shop catalog${page > 1 ? ` — Page ${page}` : ""}`;
    const description = `Browse ${label} soup shop locations, ${start + 1}–${start + slice.length} of ${shops.length}. Names, reported coordinates, sources and verification status in Soupmap's Japan pilot.`;
    return {
      path, title: `${heading} · Soupmap`, description,
      content: `<h1>${esc(heading)}</h1><p class="lede">${esc(description)}</p>
        ${base !== "/catalog/" ? '<p><a href="/catalog/">All Japan catalog</a></p>' : ""}
        ${cityLinks(all)}${limitations}
        <p>Showing ${start + 1}–${start + slice.length} of ${shops.length} locations.</p>
        ${directoryRows(slice, start)}
        <nav aria-label="Catalog pages">
          ${page > 1 ? `<a rel="prev" href="${listingPath(base, page - 1)}">← Previous page</a> · ` : ""}
          <span>Page ${page} of ${total}</span>
          ${page < total ? ` · <a rel="next" href="${listingPath(base, page + 1)}">Next page →</a>` : ""}
          ${page > 2 ? ` · <a href="${base}">First page</a>` : ""}
        </nav>`,
      structuredData: {
        "@type": "CollectionPage", name: heading, description,
        mainEntity: { "@type": "ItemList", itemListElement: slice.filter(isIndexableShop).map(shop => ({
          "@type": "ListItem", position: start + slice.indexOf(shop) + 1, name: displayName(shop, "en"), url: shopPath(shop),
        })) },
      },
    };
  });
}

export function catalogPages(shops: readonly Shop[]): CatalogPage[] {
  const pages = listingPages(shops, "/catalog/", "Japan", shops);
  for (const city of CITIES) {
    const records = shops.filter(s => s.city === city.name);
    if (records.length) pages.push(...listingPages(records, `/city/${city.slug}/`, city.name, shops));
  }
  for (const shop of shops.filter(isIndexableShop)) {
    const name = displayName(shop, "en");
    const path = shopPath(shop);
    const status = shop.verified ? "Verified on the ground." : "Unverified location; not independently checked on the ground.";
    const description = `${name} in ${shop.neighborhood}, ${shop.city}: ${shop.signatureBowl}. ${status} Shop notes, reported location and source attribution.`;
    const city = CITIES.find(c => c.name === shop.city);
    pages.push({
      path, title: `${name} — ${shop.neighborhood}, ${shop.city} · Soupmap`, description,
      content: `<nav aria-label="Breadcrumb"><a href="/catalog/">Japan catalog</a>${city ? ` / <a href="/city/${city.slug}/">${esc(city.name)}</a>` : ""}</nav>
        <h1>${esc(name)}</h1><p lang="ja">${esc(shop.nameJa)}</p>
        ${isRomanizedName(shop) ? "<p>Generated romanization: approximate reading, not an official English name.</p>" : ""}
        <p class="lede">${esc(shop.blurb)}</p><p><strong>${esc(status)}</strong></p>
        <section class="source" aria-labelledby="shop-facts"><h2 id="shop-facts">Shop facts</h2><dl>
          <dt>City</dt><dd>${esc(shop.city)}</dd><dt>Neighborhood</dt><dd>${esc(shop.neighborhood)}</dd>
          <dt>Broth style</dt><dd>${esc(BROTHS[shop.broth].label)}</dd>
          <dt>Signature bowl</dt><dd>${esc(shop.signatureBowl)}</dd>
          <dt>Price</dt><dd>${shop.priceYen ? `¥${shop.priceYen[0]}–¥${shop.priceYen[1]}` : "Not verified"}</dd>
          <dt>Hours</dt><dd>${esc(shop.hours ?? "Not verified")}</dd>
          <dt>Reported coordinates</dt><dd>${shop.lat}, ${shop.lng}</dd>
        </dl></section>
        <section class="block"><h2>Sources and verification</h2><p>${provenance(shop)}</p>
          <p>Shop notes are Soupmap editorial content, not a copied review or rating. Menu notes and broth descriptions are not a guarantee of current offerings.</p>
          ${limitations}</section>
        <p><a href="/#${shop.slug}">Open on the Soupmap map</a> · <a href="${esc(shop.googleMapsUrl)}">Check location on Google Maps</a></p>`,
      // Describe the document, not a verified business, rating, menu or opening-hours claim.
      structuredData: { "@type": "WebPage", name: `${name} — ${shop.city}`, description,
        about: { "@type": "Place", name, alternateName: shop.nameJa,
          geo: { "@type": "GeoCoordinates", latitude: shop.lat, longitude: shop.lng } } },
    });
  }
  return pages;
}

export function catalogDocument(page: CatalogPage, siteUrl: string, stylesheet: string | readonly string[]): string {
  const canonical = `${siteUrl}${page.path}`;
  const data: Record<string, unknown> = { "@context": "https://schema.org", ...structuredClone(page.structuredData), url: canonical };
  if (data["@type"] === "CollectionPage") {
    const list = data.mainEntity as { itemListElement: { url: string }[] };
    for (const item of list.itemListElement) item.url = new URL(item.url, siteUrl).href;
  }
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(page.title)}</title><meta name="description" content="${esc(page.description)}">
    <link rel="canonical" href="${esc(canonical)}"><meta name="robots" content="index,follow">
    <meta property="og:type" content="website"><meta property="og:site_name" content="Soupmap">
    <meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}">
    <meta property="og:url" content="${esc(canonical)}"><meta property="og:image" content="${esc(siteUrl)}/social/soupmap-world.png">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}">
    <meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${esc(siteUrl)}/social/soupmap-world.png">
    <link rel="icon" href="/favicon.svg">${(typeof stylesheet === "string" ? [stylesheet] : stylesheet).map(href => `<link rel="stylesheet" href="${esc(href)}">`).join("")}
    <script type="application/ld+json">${json}</script></head><body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="masthead"><p class="wordmark"><a href="/">soup<span class="wordmark__map">map</span></a></p><a class="back" href="/">← Back to the map</a></header>
    <main id="main" class="page">${page.content}</main>
    <footer class="foot"><p>Soupmap · A worldwide soup atlas, starting in Japan. <a href="/catalog/">Catalog</a> · <a href="/credits/">Data &amp; credits</a></p></footer>
    </body></html>`;
}
