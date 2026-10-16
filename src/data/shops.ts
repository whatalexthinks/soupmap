import type { Shop } from "./schema";
import raw from "./shops.json";

export type { Shop } from "./schema";

/** Validated at build time by scripts/validate-shops.ts. */
export const SHOPS = raw as unknown as readonly Shop[];

export const shopBySlug = new Map(SHOPS.map((s) => [s.slug, s]));
