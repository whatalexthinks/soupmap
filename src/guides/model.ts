/**
 * City × style guides: "Miso ramen in Sapporo", "Sanuki udon in Takamatsu".
 *
 * A guide is a filtered, ordered view of catalog records that we can place in a real
 * municipality (src/data/municipalities.ts). Nothing here is a recommendation: styles
 * come from shop names (or our notes for curated shops), and open-data records stay
 * unverified. The quality gate (src/seo/quality.ts) decides which guides are indexed.
 */
import { isEditorial } from "../data/indexation.ts";
import { MUNICIPALITIES, municipalityLabel, municipalityOf, type Municipality } from "../data/municipalities.ts";
import { prefectureByCode, type Prefecture } from "../data/prefectures.ts";
import type { Shop } from "../data/schema.ts";
import { displayName } from "../names.ts";
import { GUIDE_STYLES, matchesStyle, type GuideStyle } from "./styles.ts";

export * from "./styles.ts";

export interface GuidePlace {
  municipality: Municipality;
  prefecture: Prefecture;
  /** "sapporo", or "fuchu-tokyo" when another municipality has the same English name. */
  slug: string;
  /** "Kurume, Fukuoka" or "Osaka". */
  label: string;
}

const asciiSlug = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const designated = new Set(MUNICIPALITIES.flatMap(m => m.parent ? [m.parent] : []));
const RANK = { city: 2, "special-ward": 3, town: 1, village: 0, ward: -1 } as const;
const rank = (m: Municipality) => designated.has(m.code) ? 4 : RANK[m.kind];
// Slugs depend only on the municipality list, never on which shops exist, so they stay stable.
const namesakes = new Map<string, Municipality[]>();
for (const m of MUNICIPALITIES) {
  if (m.kind === "ward") continue;
  const key = asciiSlug(m.name);
  namesakes.set(key, [...(namesakes.get(key) ?? []), m]);
}

/**
 * The best-known namesake keeps the bare slug: Yokohama the city, not 横浜町 in Aomori;
 * Tokyo's Chuo ward, not 中央市. Equal ranks (府中市 in Tokyo and in Hiroshima) both
 * take their prefecture, and a town sharing a city's name and prefecture adds "town".
 */
function namePlace(municipality: Municipality): GuidePlace {
  const prefecture = prefectureByCode.get(municipality.prefecture)!;
  const base = asciiSlug(municipality.name);
  const others = (namesakes.get(base) ?? []).filter(m => m !== municipality);
  const outranks = others.every(m => rank(m) < rank(municipality));
  const sameKindNeighbour = others.some(m => m.prefecture === municipality.prefecture);
  const kind = sameKindNeighbour && (municipality.kind === "town" || municipality.kind === "village") ? municipality.kind : "";
  const label = municipalityLabel(municipality);
  return {
    municipality, prefecture,
    label: kind ? label.replace(municipality.name, `${municipality.name} ${kind}`) : label,
    slug: outranks ? base : [base, kind, prefecture.slug].filter(Boolean).join("-"),
  };
}

const PLACES = new Map<string, GuidePlace>();
const bySlug = new Map<string, GuidePlace[]>();
for (const place of MUNICIPALITIES.filter(m => m.kind !== "ward").map(namePlace)) bySlug.set(place.slug, [...(bySlug.get(place.slug) ?? []), place]);
for (const group of bySlug.values()) {
  // Two towns with one reading in one prefecture (枝幸町 and 江差町 are both Esashi): add the code.
  for (const place of group) PLACES.set(place.municipality.code, group.length > 1 ? { ...place, slug: `${place.slug}-${place.municipality.code}` } : place);
}

export function guidePlace(municipality: Municipality): GuidePlace {
  return PLACES.get(municipality.code) ?? namePlace(municipality);
}

export interface Guide {
  path: string;
  style: GuideStyle;
  place: GuidePlace;
  /** Most useful first: Soupmap selections, independents with contact details, then chains. */
  shops: Shop[];
  independents: number;
  /** Chain name → locations in this guide. */
  chains: Map<string, number>;
  /** Ward → locations, for designated cities. */
  wards: Map<string, number>;
  /** True when this municipality is where the style comes from. */
  home: boolean;
}

export const GUIDE_MIN_SHOPS = 3;
export const guidePath = (style: GuideStyle, place: GuidePlace) => `/guides/${style.id}-in-${place.slug}/`;
export const cityHubPath = (place: GuidePlace) => `/guides/city/${place.slug}/`;
export const styleHubPath = (style: GuideStyle) => `/guides/style/${style.id}/`;

const completeness = (shop: Shop) => (isEditorial(shop) ? 8 : 0) + (shop.chain ? 0 : 4) + (shop.website ? 2 : 0) + (shop.phone ? 1 : 0) + (shop.address ? 1 : 0);

export function orderGuideShops(shops: readonly Shop[]): Shop[] {
  return [...shops].sort((a, b) => completeness(b) - completeness(a)
    || displayName(a, "en").localeCompare(displayName(b, "en"), "en") || a.slug.localeCompare(b.slug));
}

export function isHome(style: GuideStyle, municipality: Municipality): boolean {
  if (!style.home || style.home.prefecture !== municipality.prefecture) return false;
  return !style.home.nameJa || style.home.nameJa === municipality.nameJa;
}

/** Every (style, municipality) pair with at least GUIDE_MIN_SHOPS places, largest first. */
export function buildGuides(shops: readonly Shop[]): Guide[] {
  type Bucket = { style: GuideStyle; city: Municipality; shops: Shop[]; wards: Map<string, number> };
  const buckets = new Map<string, Bucket>();
  for (const shop of shops) {
    const located = municipalityOf(shop);
    if (!located) continue;
    for (const style of GUIDE_STYLES) {
      if (!matchesStyle(shop, style)) continue;
      const key = `${style.id}|${located.city.code}`;
      const bucket: Bucket = buckets.get(key) ?? { style, city: located.city, shops: [], wards: new Map() };
      bucket.shops.push(shop);
      if (located.ward) bucket.wards.set(located.ward.name, (bucket.wards.get(located.ward.name) ?? 0) + 1);
      buckets.set(key, bucket);
    }
  }
  const places = new Map<string, GuidePlace>();
  const guides: Guide[] = [];
  for (const { style, city, shops: matched, wards } of buckets.values()) {
    if (matched.length < GUIDE_MIN_SHOPS) continue;
    const place = places.get(city.code) ?? guidePlace(city);
    places.set(city.code, place);
    const chains = new Map<string, number>();
    for (const shop of matched) if (shop.chain) chains.set(shop.chain, (chains.get(shop.chain) ?? 0) + 1);
    guides.push({
      path: guidePath(style, place), style, place, shops: orderGuideShops(matched),
      independents: matched.filter(s => !s.chain).length, chains, wards, home: isHome(style, city),
    });
  }
  return guides.sort((a, b) => b.shops.length - a.shops.length || a.path.localeCompare(b.path));
}

/** Straight-line distance between two municipalities' offices, in km. */
export function distanceKm(a: Pick<Municipality, "lat" | "lng">, b: Pick<Municipality, "lat" | "lng">): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
