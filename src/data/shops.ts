import { CITIES } from "./cities.ts";
import type { Shop } from "./schema.ts";
import raw from "./shops.json" with { type: "json" };
import { loadOpenCatalog } from "./load-open-catalog.ts";
import { openPlaceToShop, type OpenPlace } from "./open-catalog.ts";

export type { Shop } from "./schema.ts";

/** Validated at build time by scripts/validate-shops.ts. */
export const CURATED_SHOPS = raw as unknown as readonly Shop[];
export const OPEN_CATALOG = await loadOpenCatalog();
export const OPEN_SHOPS: readonly Shop[] = (OPEN_CATALOG.records as OpenPlace[]).map(openPlaceToShop);
export const SHOPS: readonly Shop[] = [...CURATED_SHOPS, ...OPEN_SHOPS];

export const shopBySlug = new Map(SHOPS.map((s) => [s.slug, s]));

const cityOrder = new Map(CITIES.map((c, i) => [c.name, i]));

/** North to south by city, then by latitude. The order used everywhere in the UI. */
export const ORDERED_SHOPS: readonly Shop[] = [...SHOPS].sort(
  (a, b) => Number(a.slug.startsWith("open-")) - Number(b.slug.startsWith("open-"))
    || (cityOrder.get(a.city) ?? 99) - (cityOrder.get(b.city) ?? 99) || b.lat - a.lat,
);
