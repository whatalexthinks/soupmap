import { CITIES } from "./cities.ts";
import type { Shop } from "./schema.ts";
import raw from "./shops.json" with { type: "json" };
import { loadOpenCatalog } from "./load-open-catalog.ts";
import { openPlaceToShop, type OpenPlace } from "./open-catalog.ts";

export type { Shop } from "./schema.ts";

/** Validated at build time by scripts/validate-shops.ts. */
export const CURATED_SHOPS = raw as unknown as readonly Shop[];
/** Node (build, tests) reads the full dataset, contact details included; browsers fetch them per shop. */
export const DETAILS_INLINE = typeof window === "undefined";
export const OPEN_CATALOG = await loadOpenCatalog();
/** Open records promoted to Soupmap selections are listed once, as the selection. */
const promoted = new Set(CURATED_SHOPS.flatMap(s => s.sourceId ? [s.sourceId] : []));
export const OPEN_SHOPS: readonly Shop[] = (OPEN_CATALOG.records as OpenPlace[]).filter(p => !promoted.has(p.id)).map(openPlaceToShop);
export const SHOPS: readonly Shop[] = [...CURATED_SHOPS, ...OPEN_SHOPS];

export const shopBySlug = new Map(SHOPS.map((s) => [s.slug, s]));

/** Locations per chain in this catalog, for "1 of 443 locations" on the card. */
export const CHAIN_SIZES: ReadonlyMap<string, number> = SHOPS.reduce((sizes, shop) =>
  shop.chain ? sizes.set(shop.chain, (sizes.get(shop.chain) ?? 0) + 1) : sizes, new Map<string, number>());

const cityOrder = new Map(CITIES.map((c, i) => [c.name, i]));

/** North to south by city, then by latitude. The order used everywhere in the UI. */
export const ORDERED_SHOPS: readonly Shop[] = [...SHOPS].sort(
  (a, b) => Number(a.slug.startsWith("open-")) - Number(b.slug.startsWith("open-"))
    || (cityOrder.get(a.city) ?? 99) - (cityOrder.get(b.city) ?? 99) || b.lat - a.lat,
);
