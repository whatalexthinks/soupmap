/**
 * Static pages for the city × style guides: /guides/, one hub per city and per style, and
 * /guides/<style>-in-<city>/. Rendered into the catalog's document shell so the shop
 * cards, profile dialog and save buttons work exactly as they do in the directory.
 */
import { directoryCard, profileUrl } from "./directory.ts";
import type { CatalogPage } from "./catalog.ts";
import { esc } from "../ui/dom.ts";
import { displayName, hasJapanese } from "../names.ts";
import { isEditorial } from "../data/indexation.ts";
import type { Shop } from "../data/schema.ts";
import { shortlistHash, SHORTLIST_LIMIT } from "../shortlist.ts";
import { PREFECTURES } from "../data/prefectures.ts";
import { CITIES } from "../data/cities.ts";
import {
  GUIDE_STYLES, cityHubPath, distanceKm, matchPhrase, styleHubPath, type Guide, type GuidePlace, type GuideStyle,
} from "../guides/model.ts";
import { recipeForStyle } from "../recipes/catalog-links.ts";
import { inline, renderMarkdown } from "../journal/markdown.ts";
import type { GuideIntro } from "../guides/intros.ts";
import { GUIDE_INDEX_MIN_INDEPENDENT, GUIDE_INDEX_MIN_SHOPS, type QualityInput } from "../seo/quality.ts";

export interface GuideSitePage extends CatalogPage {
  quality: QualityInput;
  /** When the data behind the page last changed (the catalog build). */
  lastmod: string;
}

/**
 * The /me/ planner's area for a place: a featured city when the guide is one (Tokyo's wards
 * plan as Tokyo), otherwise the prefecture when it has enough places to plan a day.
 */
export function plannerArea(place: GuidePlace, plannable: ReadonlySet<string>): string | undefined {
  if (place.municipality.kind === "special-ward") return "city:tokyo";
  const featured = place.municipality.kind === "city" ? CITIES.find(c => c.name === place.municipality.name) : undefined;
  if (featured) return `city:${featured.slug}`;
  return plannable.has(place.prefecture.name) ? `pref:${place.prefecture.name}` : undefined;
}
const planLink = (area: string | undefined, label: string) => area ? `<a class="directory-text-link" href="/me/?${new URLSearchParams({ area })}#plan">${label} <span aria-hidden="true">↗</span></a>` : "";

export interface GuideContext {
  /** Journal article titles by slug, for further reading. */
  articles: ReadonlyMap<string, string>;
  /** Editorial intros by guide slug (content/guides/). */
  intros?: ReadonlyMap<string, GuideIntro>;
  /** Prefectures the trip planner offers (`areaOptions` in src/me/planner.ts). */
  plannable?: ReadonlySet<string>;
  /** ISO date of the catalog the guides were built from. */
  lastmod: string;
}

const LIST_SIZE = 24;
const NEARBY = 6;

/** Journal essays that explain a style. Checked against the journal in tests. */
export const STYLE_ESSAYS: Readonly<Record<string, readonly string[]>> = {
  ramen: ["ramen-history", "regional-ramen-map", "four-ramen-flavours"],
  udon: ["three-great-udon", "sanuki-udon"],
  soba: ["soba-guide", "toshikoshi-soba"],
  oden: ["oden"],
  "tonkotsu-ramen": ["hakata-tonkotsu", "kumamoto-ramen"],
  "shoyu-ramen": ["tokyo-shoyu-chuka-soba", "asahikawa-shoyu"],
  "miso-ramen": ["sapporo-miso-ramen", "miso-types"],
  "shio-ramen": ["hakodate-shio"],
  "tori-paitan-ramen": ["four-ramen-flavours"],
  tsukemen: ["tsukemen"],
  "iekei-ramen": ["iekei-yokohama"],
  "jiro-ramen": ["ramen-jiro"],
  "hakata-ramen": ["hakata-tonkotsu", "yatai-fukuoka"],
  "kurume-ramen": ["hakata-tonkotsu"],
  "kumamoto-ramen": ["kumamoto-ramen"],
  "sapporo-ramen": ["sapporo-miso-ramen"],
  "kitakata-ramen": ["kitakata-morning-ramen"],
  "chuka-soba": ["tokyo-shoyu-chuka-soba"],
  tantanmen: ["tantanmen"],
  champon: ["champon"],
  "okinawa-soba": ["okinawa-soba"],
  "sanuki-udon": ["sanuki-udon", "three-great-udon"],
  kishimen: ["kishimen"],
  hoto: ["hoto"],
  "juwari-soba": ["soba-guide"],
};

export const indexEligible = (guide: Guide) => guide.shops.length >= GUIDE_INDEX_MIN_SHOPS && guide.independents >= GUIDE_INDEX_MIN_INDEPENDENT;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const list = (items: readonly string[]) => items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
const ja = (text: string) => `<span lang="ja">${esc(text)}</span>`;
/** Place-named styles keep their capital mid-sentence: "Hakata ramen", but "miso ramen". */
const PROPER = /^(?:Jiro|Hakata|Kurume|Kumamoto|Sapporo|Kitakata|Okinawa|Sanuki)\b/;
export const sentence = (label: string) => PROPER.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
export const inSentence = (style: GuideStyle) => sentence(style.label);

/** "448 ramen places in Sapporo, Hokkaido" or "29 places in Sapporo, Hokkaido whose names point to…". */
function counted(style: GuideStyle, n: number, where: string): string {
  return style.matchedBy === "cuisine" ? `${plural(n, `${inSentence(style)} place`)} in ${where}` : `${plural(n, "place")} in ${where} ${matchPhrase(style, n).replace(/^places? /, "")}`;
}

/**
 * A name we can stand behind in a snippet: our own for selections, the source's Latin name,
 * or the original Japanese. Never the machine romanization ("Omone Osamu Ran").
 */
export const citedName = (shop: Shop) => isEditorial(shop) || !hasJapanese(shop.name) ? displayName(shop, "en") : shop.nameJa;

/** The longest description that fits: drop example names until it does. */
function fit(make: (names: number) => string, max = 300): string {
  for (let names = 3; names > 0; names--) { const text = make(names); if (text.length <= max) return text; }
  return make(0);
}

function crumbs(items: readonly { name: string; path?: string }[]): string {
  return `<nav class="guide-crumbs" aria-label="Breadcrumb">${items.map(item => item.path
    ? `<a href="${item.path}">${esc(item.name)}</a>` : `<span aria-current="page">${esc(item.name)}</span>`).join('<span aria-hidden="true">/</span>')}</nav>`;
}

const breadcrumbData = (items: readonly { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.path })),
});

function essays(style: GuideStyle, context: GuideContext): string {
  const links = (STYLE_ESSAYS[style.id] ?? []).filter(slug => context.articles.has(slug));
  return links.length ? `<p class="guide-read"><span class="directory-kicker">Read in the journal</span>${links.map(slug =>
    `<a href="/journal/${slug}/">${esc(context.articles.get(slug)!)} <span aria-hidden="true">→</span></a>`).join("")}</p>` : "";
}

function recipeCard(style: GuideStyle, where: string): string {
  const link = recipeForStyle(style.id);
  if (!link) return "";
  const subject = style.matchedBy === "cuisine" ? style.label.toLowerCase() : link.title.replace(/ \(.*\)$/, "");
  return `<aside class="guide-recipe" aria-label="Cook it at home"><span class="guide-recipe__mark" lang="ja" aria-hidden="true">${esc(link.mark)}</span>
    <div><span class="directory-kicker">Not going out${where}?</span><h2>Make ${esc(subject.charAt(0).toLowerCase() + subject.slice(1))} at home</h2>
    <p>Our tested recipe for ${esc(link.title)}: honest timings, a servings scaler, built-in timers and swaps for gluten-free, plant-based and high-protein bowls.</p>
    <a class="directory-button" href="/recipes/${link.recipe}/">Get the recipe <span aria-hidden="true">→</span></a></div></aside>`;
}

/** "/map/#shortlist=v1&id=…": the first places of a list, pinned on the map. */
function mapLink(guide: Guide): string {
  return `/map/${shortlistHash(guide.shops.slice(0, SHORTLIST_LIMIT).map(shop => shop.slug))}`;
}

function catalogSearch(guide: Guide): string {
  const params = new URLSearchParams({ q: guide.style.matchedBy === "cuisine" ? guide.place.municipality.nameJa : `${guide.place.municipality.nameJa} ${guide.style.labelJa}` });
  params.set("cuisine", guide.style.cuisine);
  return `/catalog/?${params}`;
}

function guidePage(guide: Guide, byPlace: ReadonlyMap<string, Guide[]>, byStyle: ReadonlyMap<string, Guide[]>, context: GuideContext): GuideSitePage {
  const { style, place } = guide;
  const n = guide.shops.length;
  const city = place.municipality.name;
  const heading = `${style.label} in ${city}`;
  const names = guide.shops.slice(0, 3).map(citedName);
  const chains = [...guide.chains].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const chainCount = n - guide.independents;
  const wards = [...guide.wards].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const websites = guide.shops.filter(shop => shop.website).length;
  const intro = context.intros?.get(guide.path.slice("/guides/".length, -1));
  const description = intro
    ? fit(count => `${intro.dek} ${plural(n, "place")} in the Soupmap catalog${count ? `, including ${list(names.slice(0, count))}` : ""}.`)
    : fit(count => `${plural(n, "place")} for ${inSentence(style)} in ${place.label} in the Soupmap catalog${count ? `, including ${list(names.slice(0, count))}` : ""}. ${guide.independents.toLocaleString("en-US")} independent${chainCount ? `, ${plural(chainCount, "chain location")}` : ""}. Map links and sources.`);
  const lastmod = intro && intro.updated > context.lastmod ? intro.updated : context.lastmod;
  const where = wards.length > 1 ? ` Most are in ${list(wards.slice(0, 2).map(([ward]) => ward))}.` : "";
  const others = (byPlace.get(place.municipality.code) ?? []).filter(other => other !== guide);
  const nearby = (byStyle.get(style.id) ?? []).filter(other => other !== guide)
    .map(other => ({ other, km: distanceKm(place.municipality, other.place.municipality) }))
    .sort((a, b) => a.km - b.km).slice(0, NEARBY);
  const shown = guide.shops.slice(0, LIST_SIZE);
  const content = `${crumbs([{ name: "Guides", path: "/guides/" }, { name: city, path: cityHubPath(place) }, { name: style.label }])}
    <section class="directory-hero guide-hero"><div><span class="directory-kicker">${esc(place.prefecture.name)} · ${ja(place.municipality.nameJa)} · ${ja(style.labelJa)}</span>
      <h1>${esc(heading)}</h1>
      ${intro ? `<p class="lede">${esc(intro.dek)}</p><p class="guide-count">Soupmap lists ${esc(counted(style, n, place.label))}.${esc(where)}</p>` : `<p class="lede">Soupmap lists ${esc(counted(style, n, place.label))}.${esc(where)}${guide.home ? ` ${esc(style.home!.note)}` : ""}</p>`}</div>
      <aside class="directory-hero__aside"><strong>${n.toLocaleString("en-US")}</strong><p>${esc(counted(style, n, city).replace(/^[\d,]+ /, ""))}.</p>
      <p>${guide.independents.toLocaleString("en-US")} independent${chainCount ? ` · ${plural(chainCount, "chain location")}` : ""}${websites ? ` · ${websites} with a website` : ""}</p></aside></section>
    ${intro ? `<section class="guide-intro" aria-label="Introduction"><div class="guide-intro__text">${renderMarkdown(intro.body)}<p class="guide-intro__by">By the Soupmap editors · Updated ${esc(new Date(`${intro.updated}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }))}</p></div>${intro.tips.length ? `<aside class="guide-intro__tips" aria-labelledby="guide-tips"><h2 id="guide-tips">Know before you go</h2><ul>${intro.tips.map(tip => `<li>${inline(tip)}</li>`).join("")}</ul></aside>` : ""}</section>` : ""}
    <nav class="guide-actions" aria-label="Use this list"><a class="directory-button" href="${esc(mapLink(guide))}">See ${n > SHORTLIST_LIMIT ? `the first ${SHORTLIST_LIMIT}` : n === 1 ? "it" : `all ${n}`} on the map <span aria-hidden="true">↗</span></a><a class="directory-text-link" href="${esc(catalogSearch(guide))}">Search them in the catalog <span aria-hidden="true">↗</span></a><a class="directory-text-link" href="${cityHubPath(place)}">Everything in ${esc(city)}</a>${planLink(plannerArea(place, context.plannable ?? new Set()), "Plan a day here")}</nav>
    <section class="guide-about" aria-labelledby="guide-about"><div><h2 id="guide-about">About ${esc(inSentence(style))}</h2><p>${esc(style.about)}</p>${guide.home ? `<p><strong>${esc(style.home!.note)}</strong></p>` : ""}${essays(style, context)}</div>
      <dl class="guide-facts">${wards.length > 1 ? `<div><dt>Where</dt><dd>${wards.slice(0, 6).map(([ward, count]) => `${esc(ward)} <small>${count}</small>`).join(" · ")}</dd></div>` : ""}
        <div><dt>Chains</dt><dd>${chains.length ? chains.slice(0, 4).map(([chain, count]) => `${esc(chain)} <small>${count}</small>`).join(" · ") : "None listed: every place here is independent."}</dd></div>
        <div><dt>How we matched</dt><dd>${style.matchedBy === "cuisine" ? `The record's category or name says ${esc(inSentence(style))}.` : style.matchedBy === "broth" ? "The shop's name says which broth (味噌, 豚骨…), or our notes do for Soupmap selections." : `The shop's own name says ${ja(style.labelJa)}.`} Not a menu check.</dd></div></dl></section>
    <h2 class="guide-list-title">The list${n > LIST_SIZE ? `: the first ${LIST_SIZE} of ${n.toLocaleString("en-US")}` : ""}</h2>
    <p class="guide-list-note">Soupmap selections come first, then independent places with the most complete records. This is an order of detail, not a ranking of bowls.</p>
    <ol class="directory-grid" id="directory-results">${shown.map(shop => directoryCard(shop)).join("")}</ol>
    ${n > LIST_SIZE ? `<p class="guide-more">Plus ${plural(n - LIST_SIZE, "more place")}. <a href="${esc(catalogSearch(guide))}">Search all of them in the catalog ↗</a></p>` : ""}
    ${recipeCard(style, ` in ${city}`)}
    <section class="guide-related" aria-label="More guides">
      ${others.length ? `<div><h2>More in ${esc(city)}</h2><ul>${others.slice(0, 12).map(other => `<li><a href="${other.path}">${esc(other.style.label)}</a> <small>${other.shops.length}</small></li>`).join("")}</ul></div>` : ""}
      ${nearby.length ? `<div><h2>${esc(style.label)} nearby</h2><ul>${nearby.map(({ other, km }) => `<li><a href="${other.path}">${esc(other.place.label)}</a> <small>${other.shops.length} · ${Math.round(km)} km</small></li>`).join("")}</ul></div>` : ""}
      <div><h2>Across Japan</h2><ul><li><a href="${styleHubPath(style)}">${esc(style.label)} in every city</a></li><li><a href="/guides/">All city guides</a></li><li><a href="/catalog/">The full catalog</a></li></ul></div>
    </section>
    <details class="directory-notice"><summary>About this guide</summary>
      <p>Built from Soupmap's catalog: our own selections plus open-data listings from Overture Maps and OpenStreetMap contributors. Open-data listings are reported locations, not independently checked; menus, prices, hours and current trading status are not verified. Styles come from shop names, so a place can serve more than its name says, or less.</p>
      <p>Places are grouped by the municipality in their record. English municipality names come from official kana readings (localgovjp, CC0). Generated romanizations of shop names are approximate; the Japanese name is kept on every card. <a href="/credits/">Sources and credits</a>.</p></details>`;
  const path = guide.path;
  const title = `${style.label} in ${place.label} · ${plural(n, "place")} · Soupmap`;
  const structuredData = {
      "@type": "CollectionPage", name: heading, description, inLanguage: "en", dateModified: lastmod,
      ...(intro ? { abstract: intro.dek, author: { "@type": "Organization", name: "Soupmap" } } : {}),
      isPartOf: { "@type": "WebSite", name: "Soupmap" },
      about: { "@type": "Thing", name: style.label, alternateName: style.labelJa, description: style.about },
      spatialCoverage: { "@type": "AdministrativeArea", name: place.label, alternateName: place.municipality.nameJa,
        geo: { "@type": "GeoCoordinates", latitude: place.municipality.lat, longitude: place.municipality.lng },
        containedInPlace: { "@type": "AdministrativeArea", name: place.prefecture.name } },
      breadcrumb: breadcrumbData([{ name: "Guides", path: "/guides/" }, { name: city, path: cityHubPath(place) }, { name: style.label, path }]),
      mainEntity: { "@type": "ItemList", numberOfItems: n, itemListElement: shown.map((shop, index) => ({
        "@type": "ListItem", position: index + 1, name: citedName(shop), url: profileUrl(shop) })) },
  };
  return {
    path, title, description, content, lastmod, structuredData,
    quality: { path, kind: "guide", title, description, data: { ...structuredData, url: path }, items: n, independents: guide.independents,
      places: guide.shops.map(shop => ({ lat: shop.lat, lng: shop.lng })) },
  };
}

function cityHub(place: GuidePlace, guides: readonly Guide[], hubs: ReadonlyMap<string, GuidePlace>, context: GuideContext): GuideSitePage {
  const city = place.municipality.name;
  const cuisines = guides.filter(g => g.style.matchedBy === "cuisine");
  const styles = guides.filter(g => g.style.matchedBy !== "cuisine");
  const eligible = guides.filter(indexEligible).length;
  const total = cuisines.reduce((sum, g) => sum + g.shops.length, 0);
  const lead = (cuisines.length ? cuisines : guides).slice(0, 3).map(g => inSentence(g.style));
  const kinds = list(lead).charAt(0).toUpperCase() + list(lead).slice(1);
  const heading = `${kinds} in ${city}`;
  const description = `City guide to ${list(lead)} in ${place.label}: ${plural(total || guides[0]!.shops.length, "place")} in the Soupmap catalog across ${plural(guides.length, "guide")}${styles.length ? `, including ${list(styles.slice(0, 2).map(g => inSentence(g.style)))}` : ""}.`;
  const near = [...hubs.values()].filter(other => other !== place)
    .map(other => ({ other, km: distanceKm(place.municipality, other.municipality) })).sort((a, b) => a.km - b.km).slice(0, NEARBY);
  const path = cityHubPath(place);
  const item = (g: Guide) => `<li><a href="${g.path}"><span>${esc(g.style.label)}</span> <span lang="ja">${esc(g.style.labelJa)}</span></a><small>${plural(g.shops.length, "place")}${g.home ? " · its home city" : ""}</small></li>`;
  const content = `${crumbs([{ name: "Guides", path: "/guides/" }, { name: city }])}
    <section class="directory-hero guide-hero"><div><span class="directory-kicker">${esc(place.prefecture.name)} · ${ja(place.municipality.nameJa)}</span><h1>${esc(heading)}</h1>
      <p class="lede">Every bowl Soupmap can place in ${esc(place.label)}, by style. Pick a guide for the list, the map and the details.</p></div>
      <aside class="directory-hero__aside"><strong>${(total || guides[0]!.shops.length).toLocaleString("en-US")}</strong><p>places across ${plural(guides.length, "guide")}.</p></aside></section>
    ${cuisines.length ? `<section class="guide-hub"><h2>By kind of noodle</h2><ul class="guide-links">${cuisines.map(item).join("")}</ul></section>` : ""}
    ${styles.length ? `<section class="guide-hub"><h2>By style</h2><ul class="guide-links">${styles.map(item).join("")}</ul></section>` : ""}
    <nav class="guide-actions" aria-label="More ways to browse"><a class="directory-text-link" href="/catalog/?${new URLSearchParams({ q: place.municipality.nameJa })}">Search ${esc(city)} in the catalog ↗</a>${planLink(plannerArea(place, context.plannable ?? new Set()), "Plan a day of bowls")}</nav>
    ${near.length ? `<section class="guide-related"><div><h2>Nearby</h2><ul>${near.map(({ other, km }) => `<li><a href="${cityHubPath(other)}">${esc(other.label)}</a> <small>${Math.round(km)} km</small></li>`).join("")}</ul></div></section>` : ""}`;
  const title = `${kinds} in ${place.label} · Soupmap city guide`;
  const structuredData = {
      "@type": "CollectionPage", name: heading, description, inLanguage: "en", dateModified: context.lastmod,
      spatialCoverage: { "@type": "AdministrativeArea", name: place.label, alternateName: place.municipality.nameJa,
        geo: { "@type": "GeoCoordinates", latitude: place.municipality.lat, longitude: place.municipality.lng } },
      breadcrumb: breadcrumbData([{ name: "Guides", path: "/guides/" }, { name: city, path }]),
      mainEntity: { "@type": "ItemList", numberOfItems: guides.length, itemListElement: guides.map((g, index) => ({
        "@type": "ListItem", position: index + 1, name: `${g.style.label} in ${city}`, url: g.path })) },
  };
  return {
    path, title, description, content, lastmod: context.lastmod, structuredData,
    quality: { path, kind: "hub", title, description, data: { ...structuredData, url: path }, items: eligible,
      places: [{ lat: place.municipality.lat, lng: place.municipality.lng }] },
  };
}

function styleHub(style: GuideStyle, guides: readonly Guide[], context: GuideContext): GuideSitePage {
  const eligible = guides.filter(indexEligible);
  const smaller = guides.filter(g => !indexEligible(g));
  const total = guides.reduce((sum, g) => sum + g.shops.length, 0);
  const homes = guides.filter(g => g.home);
  const heading = `${style.label} across Japan`;
  const description = `${style.label} (${style.labelJa}) city by city: ${plural(total, "place")} in ${plural(guides.length, "city", "cities")} in the Soupmap catalog, led by ${list(guides.slice(0, 3).map(g => g.place.municipality.name))}.`;
  const path = styleHubPath(style);
  const row = (g: Guide) => `<li><a href="${g.path}">${esc(g.place.label)}</a><small>${plural(g.shops.length, "place")}${g.home ? " · home city" : ""}</small></li>`;
  const content = `${crumbs([{ name: "Guides", path: "/guides/" }, { name: style.label }])}
    <section class="directory-hero guide-hero"><div><span class="directory-kicker">A style guide · ${ja(style.labelJa)}</span><h1>${esc(heading)}</h1>
      <p class="lede">${esc(style.about)}${style.home ? ` ${esc(style.home.note)}` : ""}</p>${essays(style, context)}</div>
      <aside class="directory-hero__aside"><strong>${guides.length.toLocaleString("en-US")}</strong><p>${guides.length === 1 ? "city" : "cities"} with ${esc(inSentence(style))} guides.</p></aside></section>
    ${homes.length ? `<p class="guide-home">Start where it comes from: ${homes.map(g => `<a href="${g.path}">${esc(g.place.label)}</a>`).join(", ")}.</p>` : ""}
    <section class="guide-hub"><h2>Cities</h2><ul class="guide-links guide-links--cities">${eligible.map(row).join("")}</ul>
      ${smaller.length ? `<details class="guide-smaller"><summary>${plural(smaller.length, "smaller list")}</summary><ul class="guide-links guide-links--cities">${smaller.map(row).join("")}</ul></details>` : ""}</section>
    ${recipeCard(style, "")}`;
  const title = `${style.label} in Japan, city by city · Soupmap guides`;
  const structuredData = {
      "@type": "CollectionPage", name: heading, description, inLanguage: "en", dateModified: context.lastmod,
      about: { "@type": "Thing", name: style.label, alternateName: style.labelJa, description: style.about },
      breadcrumb: breadcrumbData([{ name: "Guides", path: "/guides/" }, { name: style.label, path }]),
      mainEntity: { "@type": "ItemList", numberOfItems: guides.length, itemListElement: guides.map((g, index) => ({
        "@type": "ListItem", position: index + 1, name: `${style.label} in ${g.place.label}`, url: g.path })) },
  };
  return {
    path, title, description, content, lastmod: context.lastmod, structuredData,
    quality: { path, kind: "hub", title, description, data: { ...structuredData, url: path }, items: eligible.length },
  };
}

function guidesIndex(styles: readonly { style: GuideStyle; guides: readonly Guide[] }[], places: readonly { place: GuidePlace; guides: readonly Guide[] }[], context: GuideContext): GuideSitePage {
  const total = places.length;
  const description = `City guides to ramen, udon, soba and oden in Japan: ${plural(total, "city", "cities")} and ${plural(styles.length, "style")}, from Hakata ramen in Fukuoka to Sanuki udon in Takamatsu. Built from the Soupmap catalog.`;
  const top = [...places].sort((a, b) => b.guides.reduce((s, g) => s + g.shops.length, 0) - a.guides.reduce((s, g) => s + g.shops.length, 0)).slice(0, 24);
  const byPrefecture = PREFECTURES.map(prefecture => ({ prefecture, places: places.filter(p => p.place.prefecture.code === prefecture.code) })).filter(p => p.places.length);
  const content = `${crumbs([{ name: "Guides" }])}
    <section class="directory-hero guide-hero"><div><span class="directory-kicker">City guides · ${ja("街の一杯")}</span><h1>Where the bowls are.</h1>
      <p class="lede">Ramen, udon, soba and oden, city by city and style by style. Each guide lists the places Soupmap can locate, with a map, sources and a recipe if you'd rather cook.</p></div>
      <aside class="directory-hero__aside"><strong>${total.toLocaleString("en-US")}</strong><p>cities and towns with at least one guide.</p></aside></section>
    <section class="guide-hub"><h2>By style</h2><ul class="guide-links">${styles.map(({ style, guides }) => `<li><a href="${styleHubPath(style)}"><span>${esc(style.label)}</span> <span lang="ja">${esc(style.labelJa)}</span></a><small>${plural(guides.length, "city", "cities")}</small></li>`).join("")}</ul></section>
    <section class="guide-hub"><h2>The biggest lists</h2><ul class="guide-links guide-links--cities">${top.map(({ place, guides }) => `<li><a href="${cityHubPath(place)}">${esc(place.label)}</a><small>${plural(guides.length, "guide")}</small></li>`).join("")}</ul></section>
    <section class="guide-hub"><h2>Every city, by prefecture</h2>${byPrefecture.map(({ prefecture, places: rows }) => `<details class="guide-prefecture"><summary>${esc(prefecture.name)} <span lang="ja">${esc(prefecture.nameJa)}</span> <small>${rows.length}</small></summary><ul class="guide-links guide-links--cities">${rows.map(({ place, guides }) => `<li><a href="${cityHubPath(place)}">${esc(place.municipality.name)}</a><small>${plural(guides.length, "guide")}</small></li>`).join("")}</ul></details>`).join("")}</section>
    <details class="directory-notice"><summary>How the guides are made</summary><p>Each guide groups catalog records by municipality and by the style their names suggest. A guide needs at least three places to exist, and at least ${GUIDE_INDEX_MIN_SHOPS} places, ${GUIDE_INDEX_MIN_INDEPENDENT} of them independent, before we ask search engines to index it. Open-data listings are not verified recommendations; check before you go.</p></details>`;
  const title = "City guides to ramen, udon, soba and oden in Japan · Soupmap";
  const structuredData = {
      "@type": "CollectionPage", name: "Soupmap city guides", description, inLanguage: "en", dateModified: context.lastmod,
      mainEntity: { "@type": "ItemList", numberOfItems: styles.length, itemListElement: styles.map(({ style }, index) => ({
        "@type": "ListItem", position: index + 1, name: `${style.label} across Japan`, url: styleHubPath(style) })) },
  };
  return {
    path: "/guides/", title, description, content, lastmod: context.lastmod, structuredData,
    quality: { path: "/guides/", kind: "listing", title, description, data: { ...structuredData, url: "/guides/" }, items: total },
  };
}

export interface GuideLink { path: string; label: string; count?: number }

/**
 * For each Soupmap selection, the indexable guides that list it (most specific first), then
 * its city hub when that is indexable too. Restaurant pages link back with these.
 */
export function guidesByShop(guides: readonly Guide[]): Map<string, GuideLink[]> {
  const eligible = guides.filter(indexEligible);
  const perPlace = new Map<string, number>();
  for (const guide of eligible) perPlace.set(guide.place.municipality.code, (perPlace.get(guide.place.municipality.code) ?? 0) + 1);
  const links = new Map<string, GuideLink[]>();
  const hubs = new Map<string, GuideLink>();
  for (const guide of eligible) {
    for (const shop of guide.shops) {
      if (!isEditorial(shop)) continue;
      links.set(shop.slug, [...(links.get(shop.slug) ?? []), { path: guide.path, label: `${guide.style.label} in ${guide.place.municipality.name}`, count: guide.shops.length }]);
      if ((perPlace.get(guide.place.municipality.code) ?? 0) >= 2) hubs.set(shop.slug, { path: cityHubPath(guide.place), label: `Every guide for ${guide.place.municipality.name}` });
    }
  }
  for (const [slug, list] of links) {
    list.sort((a, b) => a.count! - b.count!);
    const hub = hubs.get(slug);
    if (hub) list.push(hub);
  }
  return links;
}

/** Every guide page, city hub, style hub and the index, ready for catalogDocument(). */
export function guideSite(guides: readonly Guide[], context: GuideContext): GuideSitePage[] {
  const byPlace = new Map<string, Guide[]>();
  const byStyle = new Map<string, Guide[]>();
  const places = new Map<string, GuidePlace>();
  for (const guide of guides) {
    const code = guide.place.municipality.code;
    byPlace.set(code, [...(byPlace.get(code) ?? []), guide]);
    byStyle.set(guide.style.id, [...(byStyle.get(guide.style.id) ?? []), guide]);
    places.set(code, guide.place);
  }
  const styleOrder = new Map(GUIDE_STYLES.map((style, index) => [style.id, index]));
  for (const list of byPlace.values()) list.sort((a, b) => styleOrder.get(a.style.id)! - styleOrder.get(b.style.id)! || b.shops.length - a.shops.length);
  const styles = GUIDE_STYLES.filter(style => byStyle.has(style.id)).map(style => ({ style, guides: byStyle.get(style.id)! }));
  const placeRows = [...places.values()].map(place => ({ place, guides: byPlace.get(place.municipality.code)! }))
    .sort((a, b) => a.place.prefecture.code - b.place.prefecture.code || a.place.municipality.name.localeCompare(b.place.municipality.name));
  return [
    guidesIndex(styles, placeRows, context),
    ...styles.map(({ style, guides: list }) => styleHub(style, list, context)),
    ...placeRows.map(({ place, guides: list }) => cityHub(place, list, places, context)),
    ...guides.map(guide => guidePage(guide, byPlace, byStyle, context)),
  ];
}
