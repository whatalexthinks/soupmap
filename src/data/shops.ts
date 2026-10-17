import { CITIES } from "./cities.ts";
import type { Shop } from "./schema.ts";
import raw from "./shops.json" with { type: "json" };

export type { Shop } from "./schema.ts";

/** Validated at build time by scripts/validate-shops.ts. */
export const SHOPS = raw as unknown as readonly Shop[];

export const shopBySlug = new Map(SHOPS.map((s) => [s.slug, s]));

const cityOrder = new Map(CITIES.map((c, i) => [c.name, i]));

/** North to south by city, then by latitude. The order used everywhere in the UI. */
export const ORDERED_SHOPS: readonly Shop[] = [...SHOPS].sort(
  (a, b) => (cityOrder.get(a.city) ?? 99) - (cityOrder.get(b.city) ?? 99) || b.lat - a.lat,
);
