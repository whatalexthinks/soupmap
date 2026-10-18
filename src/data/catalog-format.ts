/**
 * How the open-data catalog travels to browsers.
 *
 * - `open-shops.json.gz`: the complete, readable dataset (downloads, build, tests).
 * - `open-shops-core.json.gz`: just what the map and search need, as compact rows.
 * - `details/<xx>.json.gz`: contact details, sharded by the first two hex digits of the
 *   Overture ID, fetched only when a visitor opens that shop.
 */
import type { OpenPlace } from "./open-catalog.ts";

export const CORE_VERSION = 1;
export const CORE_FIELDS = [
  "id", "name", "nameJa", "nameRomanized", "nameSource", "lat", "lng", "locality",
  "localityRomanized", "prefecture", "category", "styles", "chain", "licenses",
] as const;
export const DETAIL_FIELDS = ["address", "postcode", "phone", "website", "socials", "confidence"] as const;
export type OpenPlaceDetails = Pick<OpenPlace, (typeof DETAIL_FIELDS)[number]>;

type Row = [string, string, string | 0, string, 0 | 1, number, number, string, string, number, number, string, string, number];

export interface CoreCatalog {
  version: number;
  release: string;
  generatedAt: string;
  attribution: string;
  notice: string;
  categories: string[];
  licenseSets: string[][];
  rows: Row[];
}

/** Two lowercase hex digits from the start of an Overture ID ("6d814c38-…" → "6d"). */
export function detailShard(id: string): string {
  const shard = id.slice(0, 2).toLowerCase();
  if (!/^[0-9a-f]{2}$/.test(shard)) throw new Error(`Unexpected source ID: ${id}`);
  return shard;
}

export function encodeCore(meta: Omit<CoreCatalog, "version" | "categories" | "licenseSets" | "rows">, records: readonly OpenPlace[]): CoreCatalog {
  const categories: string[] = [];
  const licenseSets: string[][] = [];
  const index = <T>(list: T[], value: T, key: (v: T) => string = String) => {
    const at = list.findIndex(v => key(v) === key(value));
    return at >= 0 ? at : list.push(value) - 1;
  };
  const rows = records.map((p): Row => [
    p.id, p.name, p.nameJa === p.name ? 0 : p.nameJa, p.nameRomanized ?? "", p.nameSource === "brand" ? 1 : 0,
    p.lat, p.lng, p.locality, p.localityRomanized ?? "", p.prefecture ?? 0,
    index(categories, p.category), (p.styles ?? []).join(","), p.chain ?? "",
    index(licenseSets, p.licenses, v => v.join("|")),
  ]);
  return { version: CORE_VERSION, ...meta, categories, licenseSets, rows };
}

export function decodeCore(core: CoreCatalog): OpenPlace[] {
  if (core.version !== CORE_VERSION || !Array.isArray(core.rows)) throw new Error("Unsupported catalog format.");
  return core.rows.map(([id, name, nameJa, nameRomanized, brand, lat, lng, locality, localityRomanized, prefecture, category, styles, chain, licenses]) => ({
    id, name, nameJa: nameJa === 0 ? name : nameJa, lat, lng, locality,
    category: core.categories[category] ?? "restaurant", licenses: core.licenseSets[licenses] ?? [],
    ...(nameRomanized ? { nameRomanized } : {}), ...(brand ? { nameSource: "brand" as const } : {}),
    ...(localityRomanized ? { localityRomanized } : {}), ...(prefecture ? { prefecture } : {}),
    ...(styles ? { styles: styles.split(",") } : {}), ...(chain ? { chain } : {}),
  }));
}

export function pickDetails(place: OpenPlace): OpenPlaceDetails | undefined {
  const details: OpenPlaceDetails = {};
  for (const field of DETAIL_FIELDS) if (place[field] !== undefined) Object.assign(details, { [field]: place[field] });
  return Object.keys(details).length ? details : undefined;
}
