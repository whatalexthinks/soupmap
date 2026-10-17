/**
 * Build the redistributable catalog from an actual Overture extract.
 * node --import tsx scripts/import-open-places.ts --input /tmp/soupmap-overture.json
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { parseArgs, distanceM, loadShops } from "./lib/util.ts";
import { openPlaceToShop, type OpenPlace } from "../src/data/open-catalog.ts";
import { ShopsSchema } from "../src/data/schema.ts";

const args = parseArgs(process.argv.slice(2));
if (typeof args.input !== "string") throw new Error("--input must point to an Overture extract");
const source = JSON.parse(readFileSync(args.input, "utf8")) as {
  release: string;
  records: Array<{
    id: string; names: { primary: string; common?: Record<string, string> };
    lat: number; lng: number; taxonomy?: { primary?: string };
    addresses?: Array<{ locality?: string; country?: string }>;
    sources?: Array<{ license?: string }>;
  }>;
};
if (!source.records?.length) throw new Error("Empty source; refusing to replace the catalog");
const curated = loadShops();
const seenIds = new Set<string>();
const locations = new Map<string, OpenPlace[]>();
const records: OpenPlace[] = [];
let excluded = 0;
const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
for (const raw of source.records) {
  const licenses = [...new Set((raw.sources ?? []).map(s => s.license).filter((s): s is string => !!s))];
  // Only redistribute records whose supplied sources have explicitly supported licenses.
  if (!licenses.length || licenses.some(l => !/^(CDLA[- ]Permissive[- ]2\.0|Apache[- ]2\.0)$/i.test(l))
    || !raw.id || !raw.names?.primary || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lng)
    || !raw.addresses?.some(a => a.country === "JP") || seenIds.has(raw.id)) {
    excluded++; continue;
  }
  const name = raw.names.common?.en || raw.names.primary;
  const nameJa = raw.names.common?.ja || raw.names.primary;
  const names = [name, nameJa].map(normalize);
  const matches = (s: { name: string; nameJa: string; lat: number; lng: number }) =>
    distanceM(raw.lat, raw.lng, s.lat, s.lng) < 75
    && [normalize(s.name), normalize(s.nameJa)].some(n => names.some(m => n === m || (Math.min(n.length, m.length) >= 4 && (n.includes(m) || m.includes(n)))));
  if (curated.some(matches)) { excluded++; continue; }
  const key = normalize(nameJa);
  if ((locations.get(key) ?? []).some(matches)) { excluded++; continue; }
  const place: OpenPlace = {
    id: raw.id, name, nameJa, lat: raw.lat, lng: raw.lng,
    locality: raw.addresses.find(a => a.country === "JP")?.locality || "",
    category: raw.taxonomy?.primary || "soup_restaurant", licenses,
  };
  seenIds.add(raw.id);
  locations.set(key, [...(locations.get(key) ?? []), place]);
  records.push(place);
}
if (!records.length) throw new Error("No eligible records; existing catalog was not changed");
records.sort((a, b) => a.id.localeCompare(b.id));
ShopsSchema.parse(records.map(openPlaceToShop));
const catalog = { release: source.release, generatedAt: new Date().toISOString(),
  attribution: "© Overture Maps Foundation and its data providers",
  notice: "Open-data listings, not editorial recommendations. Coverage is incomplete. See each record's licenses.",
  records };
const output = new URL("../public/data/open-shops.json.gz", import.meta.url);
writeFileSync(new URL(`${output.href}.tmp`), gzipSync(JSON.stringify(catalog), { level: 9 }));
renameSync(new URL(`${output.href}.tmp`), output);
console.log(`Imported ${records.length} source-attributed shops; ${excluded} duplicates or ineligible records excluded.`);
