import type { Shop } from "./schema.ts";

/**
 * A location and a boilerplate warning alone do not justify a shop document.
 * Verification is independent of eligibility: editorial records remain explicitly
 * unverified until checked. Apply this same gate to links, pages and the sitemap.
 */
export function isIndexableShop(shop: Shop): boolean {
  return shop.blurb.trim().length >= 60
    && !/listed in .{0,40}(?:catalog|dataset)|not independently verified|have not been independently verified/i.test(shop.blurb)
    && !/not verified|unknown|not available/i.test(shop.signatureBowl)
    && shop.signatureBowl.trim().length >= 5
    && shop.neighborhood !== "Japan"
    && Number.isFinite(shop.lat) && Number.isFinite(shop.lng);
}

export function shopPath(shop: Shop): string {
  return isIndexableShop(shop) ? `/shop/${shop.slug}/` : `/map/#${shop.slug}`;
}

/**
 * Hand-written records (editor's picks). `dataSource` says where a location came from,
 * and curated shops took their starting coordinates from Overture too, so it can't tell.
 */
export function isEditorial(shop: Pick<Shop, "slug">): boolean {
  return !shop.slug.startsWith("open-");
}
