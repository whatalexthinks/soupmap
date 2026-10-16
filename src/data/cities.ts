/**
 * Cities we cover. `groundHeight` is a rough ellipsoidal height (geoid + elevation, metres)
 * used to frame camera flights before the 3D tiles under the target have loaded.
 * `bbox` is [west, south, east, north] and drives the discovery scripts.
 */

export interface City {
  slug: string;
  name: string;
  nameJa: string;
  lat: number;
  lng: number;
  groundHeight: number;
  /** Default camera heading (degrees) when framing shops in this city. */
  heading: number;
  bbox: readonly [number, number, number, number];
}

export const CITIES: readonly City[] = [
  { slug: "sapporo", name: "Sapporo", nameJa: "札幌", lat: 43.0555, lng: 141.354, groundHeight: 50, heading: 10, bbox: [141.24, 42.98, 141.48, 43.13] },
  { slug: "kitakata", name: "Kitakata", nameJa: "喜多方", lat: 37.651, lng: 139.874, groundHeight: 250, heading: 0, bbox: [139.83, 37.62, 139.91, 37.68] },
  { slug: "tokyo", name: "Tokyo", nameJa: "東京", lat: 35.6812, lng: 139.7671, groundHeight: 45, heading: -20, bbox: [139.55, 35.53, 139.92, 35.82] },
  { slug: "kyoto", name: "Kyoto", nameJa: "京都", lat: 35.003, lng: 135.761, groundHeight: 80, heading: 0, bbox: [135.66, 34.92, 135.83, 35.08] },
  { slug: "osaka", name: "Osaka", nameJa: "大阪", lat: 34.6687, lng: 135.501, groundHeight: 40, heading: 15, bbox: [135.42, 34.6, 135.6, 34.75] },
  { slug: "wakayama", name: "Wakayama", nameJa: "和歌山", lat: 34.229, lng: 135.189, groundHeight: 40, heading: 0, bbox: [135.12, 34.17, 135.25, 34.28] },
  { slug: "fukuoka", name: "Fukuoka", nameJa: "福岡", lat: 33.5904, lng: 130.399, groundHeight: 35, heading: -15, bbox: [130.33, 33.54, 130.46, 33.64] },
];

export const cityByName = new Map(CITIES.map((c) => [c.name, c]));
export const cityBySlug = new Map(CITIES.map((c) => [c.slug, c]));
