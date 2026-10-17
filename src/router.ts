/**
 * Deep links. Phase 1: /#<slug> opens a shop and selection updates the hash.
 * Also accepts /shop/<slug> so Phase 2's prerendered shop pages can boot the same app.
 */
import { shopBySlug } from "./data/shops.ts";
import { parseShortlist, shortlistHash } from "./shortlist.ts";

function slugFromLocation(): string | null {
  const shared = parseShortlist(location.hash, new Set(shopBySlug.keys()));
  if (shared) {
    const slug = new URLSearchParams(location.hash.slice(1)).get('shop');
    return !shared.error && slug && shared.ids.includes(slug) ? slug : null;
  }
  let hash = '';
  try { hash = decodeURIComponent(location.hash.replace(/^#\/?/, '')); } catch { return null; }
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
    let hash = slug ? `#${slug}` : '';
    if (location.hash.startsWith('#shortlist=')) {
      const params = new URLSearchParams(location.hash.slice(1));
      params.delete('shop');
      if (slug) params.set('shop', slug);
      hash = `#${params}`;
    }
    const url = `${location.pathname}${location.search}${hash}`;
    if (url !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, "", url);
  },

  /** Hash edited by hand, or a #slug link followed. */
  onChange(handler: (slug: string | null) => void): void {
    window.addEventListener("hashchange", () => handler(slugFromLocation()));
  },

  shareUrl(slug: string): string {
    return `${location.origin}/#${slug}`;
  },

  shortlist() {
    return parseShortlist(location.hash, new Set(shopBySlug.keys()));
  },

  shortlistUrl(ids: readonly string[]): string {
    if (ids.some(id => !shopBySlug.has(id))) throw new Error('Some selected shops are no longer available.');
    return `${location.origin}/${shortlistHash(ids)}`;
  },

  clearShortlist(): void {
    if (location.hash.startsWith('#shortlist=')) history.replaceState(null, '', `${location.pathname}${location.search}`);
  },
};
