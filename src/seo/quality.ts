/**
 * The indexing quality gate. Every generated page passes through here before it may be
 * listed in a sitemap; a page that fails is still published (people can follow links to
 * it) but carries `noindex,follow` and stays out of the sitemaps.
 *
 * Entity pages (a recipe, a shop, a city guide) must each stand on their own:
 * - a description no other page shares, and not open-data boilerplate;
 * - at least MIN_ATTRIBUTES filled-in properties in their main schema.org entity;
 * - complete content: ingredients and steps for a recipe, valid coordinates in Japan for
 *   every place, and enough places (with enough independents) for a guide.
 * Navigation pages (indexes, hubs, paginated listings) need a unique title and description
 * and something to link to; a hub must link to at least two indexable guides.
 */

export type PageKind = "recipe" | "shop" | "guide" | "hub" | "listing";
export const ENTITY_KINDS: ReadonlySet<PageKind> = new Set(["recipe", "shop", "guide"]);

export const MIN_ATTRIBUTES = 8;
export const GUIDE_INDEX_MIN_SHOPS = 5;
export const GUIDE_INDEX_MIN_INDEPENDENT = 3;
export const HUB_INDEX_MIN_GUIDES = 2;
const DESCRIPTION_LENGTH = [50, 320] as const;
/** Text the open-data import writes into every record; never a page's own description. */
const BOILERPLATE = /listed in .{0,40}(?:catalog|dataset)|not independently verified|menu not verified/i;

export interface QualityInput {
  path: string;
  kind: PageKind;
  title: string;
  description: string;
  /** The page's main schema.org entity (CollectionPage, Recipe, WebPage…). */
  data: Record<string, unknown>;
  /** Places the page is about or lists; each needs coordinates inside Japan. */
  places?: readonly { lat: number; lng: number }[];
  ingredients?: number;
  steps?: number;
  /** Things the page links to: guides on a hub, recipes on a browse page, places on a guide. */
  items?: number;
  /** Independent (non-chain) places on a guide. */
  independents?: number;
}

export interface Verdict {
  indexable: boolean;
  /** Why not, in words a maintainer can act on. Empty when indexable. */
  reasons: string[];
}

const filled = (value: unknown): boolean => value !== undefined && value !== null && value !== ""
  && !(Array.isArray(value) && value.length === 0)
  && !(typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0);

/** Properties of the main entity that carry a value, not counting @context, @type and @id. */
export function structuredAttributes(data: Record<string, unknown>): number {
  return Object.entries(data).filter(([key, value]) => !key.startsWith("@") && filled(value)).length;
}

/** Japan's extent, generously: Yonaguni to Hokkaido's east cape. */
export function validJapanCoordinates({ lat, lng }: { lat: number; lng: number }): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154;
}

const normal = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export function assessPages(inputs: readonly QualityInput[]): Map<string, Verdict> {
  const descriptions = new Map<string, string[]>();
  const titles = new Map<string, string[]>();
  for (const page of inputs) {
    descriptions.set(normal(page.description), [...(descriptions.get(normal(page.description)) ?? []), page.path]);
    titles.set(normal(page.title), [...(titles.get(normal(page.title)) ?? []), page.path]);
  }
  const verdicts = new Map<string, Verdict>();
  for (const page of inputs) {
    const reasons: string[] = [];
    const sharedDescription = descriptions.get(normal(page.description))!.filter(path => path !== page.path);
    if (sharedDescription.length) reasons.push(`description is shared with ${sharedDescription.slice(0, 3).join(", ")}`);
    const sharedTitle = titles.get(normal(page.title))!.filter(path => path !== page.path);
    if (sharedTitle.length) reasons.push(`title is shared with ${sharedTitle.slice(0, 3).join(", ")}`);
    const length = page.description.trim().length;
    if (length < DESCRIPTION_LENGTH[0] || length > DESCRIPTION_LENGTH[1]) reasons.push(`description is ${length} characters (want ${DESCRIPTION_LENGTH.join("–")})`);
    if (BOILERPLATE.test(page.description)) reasons.push("description is open-data boilerplate");
    if (page.places?.some(place => !validJapanCoordinates(place))) reasons.push("a place has missing or out-of-range coordinates");
    if (page.kind !== "hub" && page.items !== undefined && page.items < 1) reasons.push("links to nothing");

    if (ENTITY_KINDS.has(page.kind)) {
      const attributes = structuredAttributes(page.data);
      if (attributes < MIN_ATTRIBUTES) reasons.push(`${attributes} structured attributes (want ${MIN_ATTRIBUTES}+)`);
    }
    if (page.kind === "recipe" && ((page.ingredients ?? 0) < 3 || (page.steps ?? 0) < 3)) reasons.push("recipe needs 3+ ingredients and 3+ steps");
    if (page.kind === "shop" && page.places?.length !== 1) reasons.push("shop page needs exactly one located place");
    if (page.kind === "guide") {
      if ((page.items ?? 0) < GUIDE_INDEX_MIN_SHOPS) reasons.push(`${page.items ?? 0} places (want ${GUIDE_INDEX_MIN_SHOPS}+)`);
      if ((page.independents ?? 0) < GUIDE_INDEX_MIN_INDEPENDENT) reasons.push(`${page.independents ?? 0} independent places (want ${GUIDE_INDEX_MIN_INDEPENDENT}+)`);
    }
    // A hub's items are the indexable guides it links to, so assess guides first.
    if (page.kind === "hub" && (page.items ?? 0) < HUB_INDEX_MIN_GUIDES) reasons.push(`links to ${page.items ?? 0} indexable guides (want ${HUB_INDEX_MIN_GUIDES}+)`);
    verdicts.set(page.path, { indexable: !reasons.length, reasons });
  }
  return verdicts;
}

/** The robots meta value for a verdict. */
export const robotsFor = (verdict: Verdict | undefined): string => verdict && !verdict.indexable ? "noindex,follow" : "index,follow";
