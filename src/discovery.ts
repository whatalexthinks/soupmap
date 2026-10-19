/** Pure discovery rules, shared by the interface and regression tests. */
import { BROTHS, type BrothId } from './data/broths.ts';
import { CITIES } from './data/cities.ts';
import type { Shop } from './data/shops.ts';
import { cuisineOf, CUISINES, type CuisineId } from './cuisines.ts';
import { displayName } from './names.ts';

export type SortOrder = 'guide' | 'name' | 'city' | 'distance';
export interface DiscoveryState {
  query: string;
  city: string;
  broths: ReadonlySet<BrothId>;
  savedOnly: boolean;
  saved: ReadonlySet<string>;
  sort: SortOrder;
  cuisine?: CuisineId | 'all';
  origin?: { lat: number; lng: number } | null;
}
export function distanceMeters(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat-a.lat)*radians, dLng = (b.lng-a.lng)*radians;
  const h = Math.sin(dLat/2)**2 + Math.cos(a.lat*radians)*Math.cos(b.lat*radians)*Math.sin(dLng/2)**2;
  return 6371000 * 2 * Math.asin(Math.min(1,Math.sqrt(h)));
}
export function discover(shops: readonly Shop[], state: DiscoveryState): Shop[] {
  const city = CITIES.find(c => c.slug === state.city);
  const terms = state.query.trim().normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const result = shops.filter(shop => {
    if (city && shop.city !== city.name) return false;
    if (state.savedOnly && !state.saved.has(shop.slug)) return false;
    if (state.broths.size && !state.broths.has(shop.broth)) return false;
    if (state.cuisine && state.cuisine !== 'all' && cuisineOf(shop) !== state.cuisine) return false;
    const broth = BROTHS[shop.broth];
    const haystack = [shop.name, shop.nameJa, shop.city, CITIES.find(c => c.name === shop.city)?.nameJa,
      shop.nameRomanized, shop.neighborhood, shop.signatureBowl, broth.label, broth.labelJa,
      CUISINES.find(c=>c.id === cuisineOf(shop))?.label].join(' ').normalize('NFKC').toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
  if (state.sort === 'name') result.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  if (state.sort === 'city') result.sort((a, b) => a.city.localeCompare(b.city) || displayName(a).localeCompare(displayName(b)));
  if (state.sort === 'distance' && state.origin) {
    const origin = state.origin;
    result.sort((a,b)=>distanceMeters(origin,a)-distanceMeters(origin,b));
  }
  return result;
}
export function parseSaved(raw: string | null, valid: ReadonlySet<string>): Set<string> {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string' && valid.has(s)) : []);
  } catch { return new Set(); }
}
export const SAVED_KEY = 'soupmap:saved:v1';
