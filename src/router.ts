/**
 * Deep links. Phase 1: /#<slug> opens a shop and selection updates the hash.
 * Also accepts /shop/<slug> so Phase 2's prerendered shop pages can boot the same app.
 */
import { shopBySlug } from "./data/shops.ts";

function slugFromLocation(): string | null {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  if (hash && shopBySlug.has(hash)) return hash;
  const match = location.pathname.match(/^\/shop\/([a-z0-9-]+)\/?$/);
  if (match?.[1] && shopBySlug.has(match[1])) return match[1];
  return null;
}

export const router = {
  initial(): string | null {
    return slugFromLocation();
  },

  set(slug: string | null): void {
    const url = slug ? `${location.pathname}${location.search}#${slug}` : `${location.pathname}${location.search}`;
    if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, "", url);
  },

  /** Hash edited by hand, or a #slug link followed. */
  onChange(handler: (slug: string | null) => void): void {
    window.addEventListener("hashchange", () => handler(slugFromLocation()));
  },

  shareUrl(slug: string): string {
    return `${location.origin}/#${slug}`;
  },
};
