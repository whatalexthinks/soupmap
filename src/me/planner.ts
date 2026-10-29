/**
 * Trip planner: a few bowls a day, grouped by neighbourhood so each day is walkable.
 * Pure and deterministic for a given seed. Suggestions come from the catalog and the
 * visitor's own saves; reasons say why a stop was chosen and never claim quality.
 */
import type { Shop } from "../data/shops.ts";
import { CITIES, cityBySlug } from "../data/cities.ts";
import { isEditorial } from "../data/indexation.ts";
import { STYLE_BY_ID } from "../data/styles.ts";
import { BROTHS, type BrothId } from "../data/broths.ts";
import { cuisineOf } from "../cuisines.ts";
import { distanceMeters } from "../discovery.ts";
import { REGIONAL_BOWLS } from "./regional.ts";

export interface Craving {
  id: string;
  label: string;
  matches(shop: Shop): boolean;
}

const broth = (id: BrothId) => (s: Shop) => s.broth === id || !!s.styles?.includes(id);
const style = (id: string) => (s: Shop) => !!s.styles?.includes(id);

export const CRAVINGS: readonly Craving[] = [
  { id: "picks", label: "Editor's picks", matches: isEditorial },
  { id: "ramen", label: "Ramen", matches: s => cuisineOf(s) === "ramen" },
  { id: "tsukemen", label: "Tsukemen", matches: broth("tsukemen") },
  { id: "miso", label: "Miso", matches: broth("miso") },
  { id: "shoyu", label: "Shoyu", matches: broth("shoyu") },
  { id: "shio", label: "Shio", matches: broth("shio") },
  { id: "tonkotsu", label: "Tonkotsu", matches: broth("tonkotsu") },
  { id: "iekei", label: "Iekei", matches: style("iekei") },
  { id: "niboshi", label: "Niboshi", matches: style("niboshi") },
  { id: "tantanmen", label: "Tantanmen", matches: style("tantanmen") },
  { id: "udon", label: "Udon", matches: s => cuisineOf(s) === "udon" },
  { id: "soba", label: "Soba", matches: s => cuisineOf(s) === "soba" },
  { id: "oden", label: "Oden", matches: s => cuisineOf(s) === "oden" },
];
const cravingById = new Map(CRAVINGS.map(c => [c.id, c]));

/** Featured cities sit in these prefectures (editorial records don't carry one). */
const CITY_PREFECTURE: Record<string, string> = {
  Sapporo: "Hokkaido", Kitakata: "Fukushima", Tokyo: "Tokyo", Kyoto: "Kyoto",
  Osaka: "Osaka", Wakayama: "Wakayama", Fukuoka: "Fukuoka",
};

export interface Area {
  /** "city:tokyo" or "pref:Kagawa". */
  id: string;
  label: string;
  count: number;
}

export function inArea(shop: Shop, area: string): boolean {
  if (area.startsWith("city:")) return shop.city === cityBySlug.get(area.slice(5))?.name;
  if (area.startsWith("pref:")) {
    const prefecture = area.slice(5);
    return (shop.prefecture ?? CITY_PREFECTURE[shop.city]) === prefecture;
  }
  return false;
}

/** The seven featured cities, then prefectures with enough shops to plan around. */
export function areaOptions(shops: readonly Shop[], minimum = 25): Area[] {
  const cities = CITIES.map(c => ({ id: `city:${c.slug}`, label: c.name, count: shops.filter(s => s.city === c.name).length }));
  const byPrefecture = new Map<string, number>();
  for (const shop of shops) {
    const prefecture = shop.prefecture ?? CITY_PREFECTURE[shop.city];
    if (prefecture) byPrefecture.set(prefecture, (byPrefecture.get(prefecture) ?? 0) + 1);
  }
  const prefectures = [...byPrefecture].filter(([, n]) => n >= minimum)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ id: `pref:${name}`, label: `${name} (prefecture)`, count }));
  return [...cities, ...prefectures];
}

export interface TripInput {
  area: string;
  days: number;
  perDay: number;
  cravings: readonly string[];
  skipChains: boolean;
  skipVisited: boolean;
  seed: number;
}

export interface PlannedStop {
  slug: string;
  reasons: string[];
  /** Straight-line distance from the previous stop of the day (0 for the first). */
  legMeters: number;
}

export interface PlannedDay {
  title: string;
  stops: PlannedStop[];
  walkMeters: number;
}

export interface TripPlan {
  area: string;
  areaLabel: string;
  days: PlannedDay[];
  /** Shops in the area that passed the filters. */
  poolSize: number;
  /** Fewer stops than asked for, because the area has too few matching shops. */
  shortfall: boolean;
}

/** FNV-1a: a stable 0–1 value per (seed, text), so a plan can be re-rolled or repeated. */
export function seeded(seed: number, text: string): number {
  let hash = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 100000) / 100000;
}

/** A short English place name for a stop: Ebisu, Shibuya, Chuo. */
export function placeName(shop: Shop): string {
  if (isEditorial(shop)) return shop.neighborhood;
  return shop.localityRomanized?.split(", ")[0] ?? shop.city;
}

interface Candidate { shop: Shop; score: number; reasons: string[] }

function score(shop: Shop, input: TripInput, saved: ReadonlySet<string>): Candidate {
  const reasons: string[] = [];
  let value = seeded(input.seed, shop.slug) * 1.5;
  if (isEditorial(shop)) { value += 8; reasons.push("Editor's pick"); }
  // Your own saves outrank our picks: it's your trip.
  if (saved.has(shop.slug)) { value += 9; reasons.push("You saved it"); }
  const matched = input.cravings.map(id => cravingById.get(id)).filter((c): c is Craving => !!c?.matches(shop));
  value += Math.min(matched.length, 2) * 4;
  if (input.cravings.length && !matched.length) value -= 5;
  const named = (shop.styles ?? []).map(id => STYLE_BY_ID.get(id)?.label).filter(Boolean);
  if (named.length) { value += 1; if (!isEditorial(shop)) reasons.push(`${named[0]}, from the name`); }
  else if (shop.broth !== "other") { value += 0.5; if (!isEditorial(shop)) reasons.push(BROTHS[shop.broth].label); }
  const regional = REGIONAL_BOWLS.find(bowl => bowl.matches(shop) && inArea(shop, input.area));
  if (regional) {
    value += 2;
    // "Tsukemen, from the name" already says it; name the region only when it adds something.
    if (!named.some(label => regional.name.includes(label!))) reasons.push(`Regional: ${regional.name}`);
  }
  if (shop.chain) value -= 1.5;
  else if (!isEditorial(shop)) reasons.push("Independent");
  if (cuisineOf(shop) === "other") value -= 1;
  return { shop, score: value, reasons: [...new Set(reasons)].slice(0, 3) };
}

function title(stops: readonly Shop[], index: number): string {
  const names = new Map<string, number>();
  for (const shop of stops) names.set(placeName(shop), (names.get(placeName(shop)) ?? 0) + 1);
  const top = [...names].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([name]) => name);
  return `Day ${index + 1} · ${top.join(" & ")}`;
}

/** Nearest-neighbour walking order from the first stop. */
function route(stops: Shop[]): { order: Shop[]; legs: number[] } {
  const order = [stops[0]!];
  const legs = [0];
  const rest = stops.slice(1);
  while (rest.length) {
    const here = order.at(-1)!;
    let best = 0;
    for (let i = 1; i < rest.length; i++) if (distanceMeters(here, rest[i]!) < distanceMeters(here, rest[best]!)) best = i;
    legs.push(Math.round(distanceMeters(here, rest[best]!)));
    order.push(rest.splice(best, 1)[0]!);
  }
  return { order, legs };
}

export function planTrip(shops: readonly Shop[], input: TripInput, saved: ReadonlySet<string> = new Set(),
  visited: ReadonlySet<string> = new Set()): TripPlan {
  const days = Math.min(Math.max(Math.round(input.days), 1), 7);
  const perDay = Math.min(Math.max(Math.round(input.perDay), 1), 4);
  const pool = shops.filter(shop => inArea(shop, input.area)
    && !(input.skipChains && shop.chain)
    && !(input.skipVisited && visited.has(shop.slug)));
  const ranked = pool.map(shop => score(shop, input, saved)).sort((a, b) => b.score - a.score);
  const used = new Set<Candidate>();
  // Days start from the strongest places, your saves first; the rest of each day comes from near that start.
  const starts = [...new Set([...ranked.filter(c => saved.has(c.shop.slug)), ...ranked.slice(0, Math.max(days * 8, 24))])];
  const seeds: Shop[] = [];
  const planned: PlannedDay[] = [];
  for (let d = 0; d < days; d++) {
    // Start each day somewhere new: prefer strong shops away from earlier days' starts.
    const startScore = (c: Candidate) => c.score + (saved.has(c.shop.slug) ? 20 : 0) - (seeds.some(s => distanceMeters(s, c.shop) < 1500) ? 6 : 0);
    const start = starts.filter(c => !used.has(c)).reduce<Candidate | undefined>((best, c) => !best || startScore(c) > startScore(best) ? c : best, undefined);
    if (!start) break;
    seeds.push(start.shop);
    used.add(start);
    const day: Candidate[] = [start];
    while (day.length < perDay) {
      const centre = { lat: day.reduce((n, c) => n + c.shop.lat, 0) / day.length, lng: day.reduce((n, c) => n + c.shop.lng, 0) / day.length };
      // Best within a walk (3 km), else within a short ride (8 km): good places, a short way off.
      let walk: Candidate | undefined, ride: Candidate | undefined, walkValue = -Infinity, rideValue = -Infinity;
      for (const c of ranked) {
        if (used.has(c) || Math.abs(c.shop.lat - centre.lat) > 0.08) continue;
        const meters = distanceMeters(centre, c.shop);
        const value = c.score - meters / 400;
        if (meters <= 3000 && value > walkValue) { walk = c; walkValue = value; }
        else if (meters <= 8000 && value > rideValue) { ride = c; rideValue = value; }
      }
      const next = walk ?? ride;
      if (!next) break;
      day.push(next);
      used.add(next);
    }
    const { order, legs } = route(day.map(c => c.shop));
    const bySlug = new Map(day.map(c => [c.shop.slug, c]));
    planned.push({
      title: title(order, d),
      stops: order.map((shop, i) => ({ slug: shop.slug, reasons: bySlug.get(shop.slug)!.reasons, legMeters: legs[i]! })),
      walkMeters: legs.reduce((a, b) => a + b, 0),
    });
  }
  const area = input.area.startsWith("city:") ? cityBySlug.get(input.area.slice(5))?.name ?? input.area : input.area.slice(5);
  const stops = planned.reduce((n, d) => n + d.stops.length, 0);
  return { area: input.area, areaLabel: area, days: planned, poolSize: pool.length, shortfall: stops < days * perDay };
}
