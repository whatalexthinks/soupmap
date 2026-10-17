/** Pure discovery rules, shared by the interface and regression tests. */
import { BROTHS, type BrothId } from './data/broths.ts';
import { CITIES } from './data/cities.ts';
import type { Shop } from './data/shops.ts';

export type SortOrder = 'guide' | 'name' | 'city';
export interface DiscoveryState {
  query: string;
  city: string;
  broths: ReadonlySet<BrothId>;
  savedOnly: boolean;
  saved: ReadonlySet<string>;
  sort: SortOrder;
}
export function discover(shops: readonly Shop[], state: DiscoveryState): Shop[] {
  const city = CITIES.find(c => c.slug === state.city);
  const terms = state.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const result = shops.filter(shop => {
    if (city && shop.city !== city.name) return false;
    if (state.savedOnly && !state.saved.has(shop.slug)) return false;
    if (state.broths.size && !state.broths.has(shop.broth)) return false;
    const broth = BROTHS[shop.broth];
    const haystack = [shop.name, shop.nameJa, shop.city, CITIES.find(c => c.name === shop.city)?.nameJa,
      shop.neighborhood, shop.signatureBowl, broth.label, broth.labelJa].join(' ').toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
  if (state.sort === 'name') result.sort((a, b) => a.name.localeCompare(b.name));
  if (state.sort === 'city') result.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  return result;
}
export function parseSaved(raw: string | null, valid: ReadonlySet<string>): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && valid.has(s)) : []);
  } catch { return new Set(); }
}
export const SAVED_KEY = 'soupmap:saved:v1';
