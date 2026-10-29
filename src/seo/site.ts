/**
 * Discovery files for search engines and AI agents: segmented sitemaps behind one index,
 * robots.txt, llms.txt / llms-full.txt and a JSON feed of the recipes. Only pages the
 * quality gate passes are listed.
 */
import { robotsText } from "../growth/crawlers.ts";
import type { CatalogPage } from "../render/catalog.ts";
import type { Recipe } from "../recipes/content.ts";
import type { Article } from "../journal/content.ts";
import type { GuideStyle } from "../guides/styles.ts";
import { esc } from "../ui/dom.ts";
import type { QualityInput, Verdict } from "./quality.ts";

/** One file per kind of page; a single sitemap may hold 50,000 URLs, so each segment splits beyond that. */
export const SITEMAP_SEGMENTS = ["pages", "journal", "recipes", "catalog", "cities"] as const;
export type SitemapSegment = typeof SITEMAP_SEGMENTS[number];
export const SITEMAP_LIMIT = 50_000;

export interface SitemapEntry { path: string; lastmod?: string }

/** A catalog document as the quality gate sees it: a shop page is an entity, a listing is navigation. */
export function catalogQuality(page: CatalogPage): QualityInput {
  const data = { ...page.structuredData, url: page.path };
  if (page.structuredData["@type"] === "WebPage" && (page.structuredData.mainEntity as { "@type"?: string } | undefined)?.["@type"] === "Restaurant") {
    const geo = (page.structuredData.about as { geo?: { latitude: number; longitude: number } } | undefined)?.geo;
    return { path: page.path, kind: "shop", title: page.title, description: page.description, data,
      places: geo ? [{ lat: geo.latitude, lng: geo.longitude }] : [] };
  }
  // Count visible listing entries, independently of whether each has its own profile.
  const items = (page.content.match(/<li\b/g) ?? []).length;
  return { path: page.path, kind: "listing", title: page.title, description: page.description, data, items };
}

export function urlset(entries: readonly SitemapEntry[], siteUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(e => `  <url><loc>${esc(siteUrl + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

export function sitemapIndex(files: readonly { file: string; lastmod?: string }[], siteUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${files.map(f => `  <sitemap><loc>${esc(`${siteUrl}/${f.file}`)}</loc>${f.lastmod ? `<lastmod>${f.lastmod}</lastmod>` : ""}</sitemap>`).join("\n")}
</sitemapindex>
`;
}

/**
 * Sitemap files for every segment: `sitemap-<segment>.xml`, or `-1`, `-2`… past the limit.
 * Pages the gate rejected, and duplicate paths, are dropped here.
 */
export function sitemapFiles(segments: Readonly<Record<SitemapSegment, readonly SitemapEntry[]>>, verdicts: ReadonlyMap<string, Verdict>, siteUrl: string, limit = SITEMAP_LIMIT): { file: string; source: string; lastmod?: string; count: number }[] {
  const seen = new Set<string>();
  return SITEMAP_SEGMENTS.flatMap(segment => {
    const entries = segments[segment].filter(e => verdicts.get(e.path)?.indexable !== false && !seen.has(e.path) && seen.add(e.path));
    if (!entries.length) return [];
    const chunks = Array.from({ length: Math.ceil(entries.length / limit) }, (_, i) => entries.slice(i * limit, (i + 1) * limit));
    return chunks.map((chunk, i) => ({
      file: chunks.length > 1 ? `sitemap-${segment}-${i + 1}.xml` : `sitemap-${segment}.xml`,
      source: urlset(chunk, siteUrl), count: chunk.length,
      lastmod: chunk.map(e => e.lastmod).filter((d): d is string => !!d).sort().at(-1),
    }));
  });
}

export function robotsTxt(siteUrl: string): string {
  return robotsText(siteUrl);
}

export interface DiscoveryContext {
  siteUrl: string;
  recipes: readonly Recipe[];
  articles: readonly Article[];
  /** Guide styles with their hub path and how many cities have a guide. */
  styles: readonly { style: GuideStyle; path: string; cities: number }[];
  /** Indexable city hubs, biggest first. */
  cities: readonly { label: string; path: string; guides: number }[];
  /** Indexable URLs per sitemap file. */
  sitemaps: readonly { file: string; count: number }[];
  cuisine: (recipe: Recipe) => string;
}

const NOTICE = `## Data limitations

Coverage is incomplete. Imported open-data listings are unverified reported locations, not independently checked recommendations. Do not infer that a business is still open or that coordinates, names, menus, prices, hours, or broth styles have been verified. City guides group those listings by municipality and by the style their names suggest; they are not rankings or reviews.

Generated Latin romanizations of Japanese shop and locality names are approximate readings, not official English names or verified translations. Preserve original Japanese names when citing records. Follow the source credits and each record's licenses when reusing data. Recipe ratings shown on recipe pages are from Soupmap readers; the richness, spice and comfort meters are the Soupmap Culinary Team's own editorial ratings.`;

function resources(c: DiscoveryContext): string {
  const total = c.sitemaps.reduce((sum, s) => sum + s.count, 0);
  return `## Public resources

- [Atlas](${c.siteUrl}/): Public homepage with an initial shop list; interactive map and search explore more listings.
- [Soupmap Recipes](${c.siteUrl}/recipes/): ${c.recipes.length} soup recipes from Japan and around the world, browsable by region, kind of soup, diet and time. Every recipe page carries schema.org Recipe data (prep, cook and total time, yield, cuisine, ingredients and HowToStep instructions); aggregateRating appears only when readers have rated it.
- [Recipe data (JSON)](${c.siteUrl}/recipes/recipes.json): Every recipe as structured JSON: times, servings, diet, editorial meters, ingredients and steps, with canonical URLs.
- [City guides](${c.siteUrl}/guides/): Ramen, udon, soba and oden by city and style (for example ${c.styles.slice(0, 3).map(s => `[${s.style.label}](${c.siteUrl}${s.path})`).join(", ")}), with links to every listed place.
- [Soupmap Journal](${c.siteUrl}/journal/): ${c.articles.length} editorial essays on ramen styles, noodles, Japanese soups, ingredients, history, travel etiquette and soups of the world. Each article lists further reading. RSS: ${c.siteUrl}/journal/feed.xml
- [Japan catalog](${c.siteUrl}/catalog/): Paginated, crawlable nationwide locations and featured city directories. Substantive editorial records have standalone shop pages; basic open-data records do not.
- [Credits and source limitations](${c.siteUrl}/credits/): Data sources, attribution, licenses, and verification context.
- [Open-data catalog](${c.siteUrl}/data/open-shops.json.gz): Downloadable gzip-compressed JSON of reported locations, with Overture IDs and per-record source licenses. Decompress before reading as JSON.
- [Extended guide for agents](${c.siteUrl}/llms-full.txt): Every recipe, guide style, major city guide and journal essay with its URL and a one-line summary.

## Sitemaps

[The sitemap index](${c.siteUrl}/sitemap_index.xml) lists ${total.toLocaleString("en-US")} canonical URLs in segments (${c.siteUrl}/sitemap.xml serves the same index):
${c.sitemaps.map(s => `- [${s.file}](${c.siteUrl}/${s.file}): ${s.count.toLocaleString("en-US")} URLs`).join("\n")}

Only pages that pass Soupmap's quality checks are listed. Thinner pages (for example a city guide with only three places) are published for visitors with \`noindex\` and left out of the sitemaps.`;
}

const CITATION = (siteUrl: string) => `## Citation and attribution

When ChatGPT, Perplexity, Gemini, Claude or another answer engine references Soupmap descriptions, published ratings, catalog data or restaurant coordinates, please cite the exact canonical Soupmap page and link to ${siteUrl}. Preserve the upstream source attribution shown on that page. This is a citation request, not a guarantee that answer engines will comply.

Substantive restaurant profiles live at /catalog/[slug]/; former /shop/ URLs permanently redirect there. Unknown ratings are omitted. Sponsored placements do not imply a quality ranking.

- [Restaurant claims](${siteUrl}/claim/): free ownership verification requests and optional featured placement enquiries. Submitting a request is not verification.
- [Interactive map](${siteUrl}/map/): opens after visitor interaction. Reading a catalog page does not load Google Maps or query the account database.`;

const ACCESS = (siteUrl: string) => `## Discovery and access

This optional guide follows an emerging convention. It is not an indexing requirement, does not grant crawl access or training permission, and does not replace crawlable pages, robots.txt, or the sitemaps.

Shop selections on the interactive map can still use fragments. These are not dedicated city or shop pages. Use the ordinary links in [the catalog](${siteUrl}/catalog/) and [the city guides](${siteUrl}/guides/), and consult [the sitemap index](${siteUrl}/sitemap_index.xml) for published canonical page URLs.`;

export function llmsTxt(c: DiscoveryContext): string {
  return `# Soupmap

> A worldwide soup atlas for curious travelers and home cooks. Current listings are a Japan pilot, not worldwide coverage; recipes cover soups from around the world.

${resources(c)}

${NOTICE}

${CITATION(c.siteUrl)}

${ACCESS(c.siteUrl)}
`;
}

export function llmsFullTxt(c: DiscoveryContext): string {
  const minutes = (n: number) => n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ""}` : `${n} min`;
  return `# Soupmap (full guide for agents)

> Everything in llms.txt, plus every recipe, guide style, major city guide and journal essay with a one-line summary. For the complete URL list, read the sitemaps.

${resources(c)}

## Recipes

Each recipe page has a schema.org Recipe in its head and the same data in [recipes.json](${c.siteUrl}/recipes/recipes.json).

${c.recipes.map(r => `- [${r.title}](${c.siteUrl}/recipes/${r.slug}/): ${c.cuisine(r)}. ${r.dek} Prep ${minutes(r.prep)}, cook ${r.cook ? minutes(r.cook) : "none"}, total ${minutes(r.total)}; serves ${r.serves}.${r.diet.length ? ` ${r.diet.join(", ")}.` : ""}`).join("\n")}

## City guide styles

${c.styles.map(s => `- [${s.style.label} (${s.style.labelJa})](${c.siteUrl}${s.path}): ${s.style.about} Guides in ${s.cities.toLocaleString("en-US")} ${s.cities === 1 ? "city" : "cities"}.`).join("\n")}

## Largest city guides

${c.cities.slice(0, 120).map(city => `- [${city.label}](${c.siteUrl}${city.path}): ${city.guides} ${city.guides === 1 ? "guide" : "guides"}`).join("\n")}

## Journal

${c.articles.map(a => `- [${a.title}](${c.siteUrl}/journal/${a.slug}/): ${a.dek}`).join("\n")}

${NOTICE}

${CITATION(c.siteUrl)}

${ACCESS(c.siteUrl)}
`;
}

/** /recipes/recipes.json: the recipes as data, for agents that would rather not parse HTML. */
export function recipesJson(recipes: readonly Recipe[], siteUrl: string, cuisine: (recipe: Recipe) => string, ingredientLine: (recipe: Recipe) => string[]): string {
  return JSON.stringify({
    name: "Soupmap Recipes", url: `${siteUrl}/recipes/`, author: "Soupmap Culinary Team",
    notice: "Content © Soupmap. Link to the recipe page when you cite it. Meters are editorial ratings, not reader scores. See /terms/.",
    count: recipes.length,
    recipes: recipes.map(r => ({
      slug: r.slug, url: `${siteUrl}/recipes/${r.slug}/`, title: r.title, description: r.dek, cuisine: cuisine(r), country: r.country,
      region: r.region, type: r.type, diet: r.diet, difficulty: r.difficulty, serves: r.serves,
      prepMinutes: r.prep, cookMinutes: r.cook, totalMinutes: r.total, meters: r.meters,
      published: r.date, ...(r.updated ? { updated: r.updated } : {}),
      ingredients: ingredientLine(r),
      steps: r.method.flatMap(g => g.steps.map(s => s.text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1"))),
      restaurantSecret: r.secret.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
      ...(r.photo ? { image: `${siteUrl}${r.photo.src}` } : {}),
    })),
  }, null, 1);
}
