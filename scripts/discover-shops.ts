/**
 * Shop discovery from open POI data → review leads in data/candidates/<city>.json.
 *
 * It NEVER writes to src/data/shops.json. Candidates are leads: a human verifies each
 * one and writes the shop entry (see README "Promote a candidate").
 *
 * Sources
 *   - Overture Maps Places (preferred; mostly CDLA Permissive 2.0, license per record)
 *     via DuckDB against Overture's cloud GeoParquet, or the `overturemaps` CLI.
 *   - OpenStreetMap via Overpass (secondary; ODbL, share-alike): one request per city,
 *     2 s apart, with an identifying User-Agent.
 *
 * Usage
 *   npm run discover                                     # every city, Overture + OSM
 *   npm run discover -- --city tokyo,fukuoka             # some cities (slugs from src/data/cities.ts)
 *   npm run discover -- --source overture                # overture | osm | all
 *   npm run discover -- --engine cli                     # Overture engine: duckdb | cli (default: duckdb if installed)
 *   npm run discover -- --release 2026-09-23.1           # Overture release (default: latest)
 *   npm run discover -- --list-categories --city tokyo   # inspect the Places taxonomy first
 *   npm run discover -- --city tokyo --overture-file tokyo.geojsonseq   # use a download you already have
 *
 * Environment: OVERPASS_URL (default https://overpass-api.de/api/interpreter).
 */
import { spawnSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { CITIES, type City } from "../src/data/cities.ts";
import type { Shop } from "../src/data/schema.ts";
import { color, describeError, distanceM, fetchWithTimeout, loadShops, parseArgs, sleep } from "./lib/util.ts";

// ── What counts as a soup shop ──────────────────────────────────────────────

/** Overture taxonomy values (inspect with --list-categories; the taxonomy evolves). */
const CATEGORY_RE = /ramen|noodle|udon|soba|oden|soup/i;
/** Japanese names that give a restaurant away, for places only tagged "japanese_restaurant". */
const NAME_RE = /ラーメン|らーめん|拉麺|中華そば|つけ麺|担々麺|担担麺|うどん|饂飩|そば|蕎麦|おでん|麺/;
/** OSM cuisine tag. */
const CUISINE_RE = "ramen|noodle|udon|soba";

const OVERTURE_BUCKET = "https://overturemaps-us-west-2.s3.amazonaws.com";
const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const USER_AGENT = "soupmap-discover/0.1 (+https://soupmap.com/credits/)";
const OUT_DIR = new URL("../data/candidates/", import.meta.url);
const NEAR_EXISTING_M = 75;

export interface Candidate {
  source: "overture" | "osm";
  sourceId: string;
  name: string;
  "name:ja": string | null;
  lat: number;
  lng: number;
  website: string | null;
  opening_hours: string | null;
  category: string | null;
  /** Why it's a lead: a soup-shop category/cuisine tag, or only its Japanese name. */
  matchedBy: "category" | "name";
  /** License of this record, from the source. */
  license: string;
  confidence: number | null;
  /** Slug of a shop we already list within 75 m, if any. */
  alreadyListed: string | null;
}

const JAPANESE = /[぀-ヿ㐀-鿿]/;

// ── Overture ────────────────────────────────────────────────────────────────

interface OvertureRecord {
  id?: string;
  names?: { primary?: string; common?: Record<string, string> | Array<[string, string]> | null } | null;
  taxonomy?: { primary?: string | null; hierarchy?: string[] | null; alternates?: string[] | null } | null;
  /** Pre-2.0 schema (removed in Overture schema 2.0.0, 2026-09). */
  categories?: { primary?: string | null; alternate?: string[] | null } | null;
  confidence?: number | null;
  websites?: string[] | null;
  sources?: Array<{ dataset?: string | null; license?: string | null }> | null;
  lat?: number;
  lng?: number;
}

function commonName(names: OvertureRecord["names"], lang: string): string | null {
  const common = names?.common;
  if (!common) return null;
  if (Array.isArray(common)) return common.find(([k]) => k === lang)?.[1] ?? null;
  return common[lang] ?? null;
}

function categoriesOf(r: OvertureRecord): { primary: string | null; all: string[]; restaurant: boolean } {
  const primary = r.taxonomy?.primary ?? r.categories?.primary ?? null;
  const all = [primary, ...(r.taxonomy?.alternates ?? r.categories?.alternate ?? [])].filter((c): c is string => !!c);
  const hierarchy = r.taxonomy?.hierarchy ?? [];
  const restaurant = hierarchy.includes("restaurant") || all.some((c) => /restaurant|food/.test(c));
  return { primary, all, restaurant };
}

function overtureCandidate(r: OvertureRecord, shops: readonly Shop[]): Candidate | null {
  const name = r.names?.primary ?? "";
  const { primary, all, restaurant } = categoriesOf(r);
  const byCategory = all.some((c) => CATEGORY_RE.test(c));
  const byName = restaurant && NAME_RE.test(name);
  if (!r.id || !name || r.lat === undefined || r.lng === undefined || (!byCategory && !byName)) return null;
  const sources = r.sources ?? [];
  const licenses = [...new Set(sources.map((s) => s.license).filter(Boolean))].join(", ") || "see Overture attribution page";
  const datasets = [...new Set(sources.map((s) => s.dataset).filter(Boolean))].join(", ");
  return {
    source: "overture",
    sourceId: r.id,
    name: commonName(r.names, "en") ?? name,
    "name:ja": commonName(r.names, "ja") ?? (JAPANESE.test(name) ? name : null),
    lat: r.lat,
    lng: r.lng,
    website: r.websites?.[0] ?? null,
    opening_hours: null,
    category: primary,
    matchedBy: byCategory ? "category" : "name",
    license: datasets ? `${licenses} (${datasets})` : licenses,
    confidence: r.confidence ?? null,
    alreadyListed: nearestShop(r.lat, r.lng, shops),
  };
}

async function latestRelease(): Promise<string> {
  const res = await fetchWithTimeout(`${OVERTURE_BUCKET}/?list-type=2&prefix=release/&delimiter=/`, { timeoutMs: 20_000 });
  const xml = await res.text();
  const releases = [...xml.matchAll(/<Prefix>release\/([^/<]+)\/<\/Prefix>/g)].map((m) => m[1] ?? "").filter(Boolean).sort();
  const latest = releases.at(-1);
  if (!latest) throw new Error("couldn't list Overture releases");
  return latest;
}

function hasCommand(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

function bboxSql(city: City): string {
  const [w, s, e, n] = city.bbox;
  return `bbox.xmin >= ${w} AND bbox.xmax <= ${e} AND bbox.ymin >= ${s} AND bbox.ymax <= ${n}`;
}

function duckdb(sql: string): unknown[] {
  const result = spawnSync("duckdb", ["-json", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`duckdb failed: ${result.stderr.trim().slice(0, 500)}`);
  const text = result.stdout.trim();
  return text ? (JSON.parse(text) as unknown[]) : [];
}

function placesPath(release: string): string {
  if (!/^\d{4}-\d{2}-\d{2}\.\d+$/.test(release)) throw new Error(`bad release "${release}"`);
  return `s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*`;
}

const DUCKDB_SETUP = "INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';";

function overtureViaDuckdb(city: City, release: string): OvertureRecord[] {
  // Points have xmin = xmax, so the bbox centre is the location (no spatial extension needed).
  return duckdb(`${DUCKDB_SETUP}
    SELECT id, names, taxonomy, confidence, websites, sources,
           (bbox.xmin + bbox.xmax) / 2 AS lng, (bbox.ymin + bbox.ymax) / 2 AS lat
    FROM read_parquet('${placesPath(release)}', hive_partitioning = 1)
    WHERE ${bboxSql(city)}
      AND (regexp_matches(lower(coalesce(taxonomy.primary, '') || ' ' || coalesce(array_to_string(taxonomy.alternates, ' '), '')), '${CATEGORY_RE.source}')
           OR (list_contains(taxonomy.hierarchy, 'restaurant') AND regexp_matches(coalesce(names.primary, ''), '${NAME_RE.source}')))`) as OvertureRecord[];
}

function listCategoriesViaDuckdb(city: City, release: string): Array<{ category: string; n: number }> {
  return duckdb(`${DUCKDB_SETUP}
    SELECT taxonomy.primary AS category, count(*) AS n
    FROM read_parquet('${placesPath(release)}', hive_partitioning = 1)
    WHERE ${bboxSql(city)} AND list_contains(taxonomy.hierarchy, 'food_and_drink')
    GROUP BY 1 ORDER BY n DESC LIMIT 80`) as Array<{ category: string; n: number }>;
}

/** Reads the `overturemaps download -f geojsonseq` (or geojson) format. */
async function* readOvertureFile(path: string): AsyncGenerator<OvertureRecord> {
  const toRecord = (feature: { id?: string; geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }) => {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    return { id: feature.id, ...(feature.properties as object), lng, lat } as OvertureRecord;
  };
  const fd = openSync(path, "r");
  const buffer = Buffer.alloc(64);
  const head = buffer.subarray(0, readSync(fd, buffer, 0, 64, 0)).toString("utf8").replace(/\s+/g, "");
  closeSync(fd);
  if (head.startsWith('{"type":"FeatureCollection"')) {
    const collection = JSON.parse(readFileSync(path, "utf8")) as { features?: unknown[] };
    for (const f of collection.features ?? []) yield toRecord(f as Parameters<typeof toRecord>[0]);
    return;
  }
  const lines = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim().replace(/^\x1e/, "");
    if (trimmed) yield toRecord(JSON.parse(trimmed) as Parameters<typeof toRecord>[0]);
  }
}

function overtureViaCli(city: City, release: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), "soupmap-overture-"));
  const out = join(dir, `${city.slug}.geojsonseq`);
  const args = ["download", `--bbox=${city.bbox.join(",")}`, "-f", "geojsonseq", "-t", "place", "-o", out];
  if (release) args.push("-r", release);
  console.log(color.dim(`  overturemaps ${args.join(" ")}`));
  const result = spawnSync("overturemaps", args, { stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) throw new Error("overturemaps CLI failed");
  return out;
}

// ── OpenStreetMap via Overpass ──────────────────────────────────────────────

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

async function osmCandidates(city: City, shops: readonly Shop[]): Promise<Candidate[]> {
  const [w, s, e, n] = city.bbox;
  const box = `${s},${w},${n},${e}`;
  const query = `[out:json][timeout:90];
(
  nwr["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"${CUISINE_RE}",i](${box});
  nwr["amenity"~"^(restaurant|fast_food)$"]["name:ja"~"${NAME_RE.source}"](${box});
  nwr["amenity"~"^(restaurant|fast_food)$"]["name"~"${NAME_RE.source}"](${box});
);
out center tags;`;
  const res = await fetchWithTimeout(OVERPASS_URL, {
    method: "POST",
    timeoutMs: 120_000,
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OsmElement[] };
  const out: Candidate[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags["name:en"] ?? tags.name;
    if (lat === undefined || lng === undefined || !name) continue;
    out.push({
      source: "osm",
      sourceId: `${el.type}/${el.id}`,
      name,
      "name:ja": tags["name:ja"] ?? (tags.name && JAPANESE.test(tags.name) ? tags.name : null),
      lat,
      lng,
      website: tags.website ?? tags["contact:website"] ?? null,
      opening_hours: tags.opening_hours ?? null,
      category: tags.cuisine ?? null,
      matchedBy: tags.cuisine && new RegExp(CUISINE_RE, "i").test(tags.cuisine) ? "category" : "name",
      license: "ODbL 1.0 (© OpenStreetMap contributors)",
      confidence: null,
      alreadyListed: nearestShop(lat, lng, shops),
    });
  }
  return out;
}

// ── Shared ──────────────────────────────────────────────────────────────────

function nearestShop(lat: number, lng: number, shops: readonly Shop[]): string | null {
  let best: { slug: string; d: number } | null = null;
  for (const s of shops) {
    const d = distanceM(lat, lng, s.lat, s.lng);
    if (d <= NEAR_EXISTING_M && (!best || d < best.d)) best = { slug: s.slug, d };
  }
  return best?.slug ?? null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const shops = loadShops();
  const wanted = typeof args.city === "string" ? args.city.split(",").map((c) => c.trim()) : CITIES.map((c) => c.slug);
  const cities = wanted.map((slug) => {
    const city = CITIES.find((c) => c.slug === slug);
    if (!city) throw new Error(`unknown city "${slug}". Known: ${CITIES.map((c) => c.slug).join(", ")}`);
    return city;
  });
  const source = typeof args.source === "string" ? args.source : "all";
  const overtureFile = typeof args["overture-file"] === "string" ? args["overture-file"] : undefined;
  const useOverture = source === "all" || source === "overture";
  const useOsm = (source === "all" || source === "osm") && !args["list-categories"];
  if (overtureFile && cities.length !== 1) throw new Error("--overture-file needs exactly one --city");

  const engine =
    overtureFile ? "file" : typeof args.engine === "string" ? args.engine : hasCommand("duckdb") ? "duckdb" : "cli";
  if (useOverture && engine === "cli" && !overtureFile && !hasCommand("overturemaps")) {
    throw new Error("Neither duckdb nor the overturemaps CLI is installed. See README → Shop discovery.");
  }
  let release = typeof args.release === "string" ? args.release : undefined;
  if (useOverture && engine === "duckdb" && !release) release = await latestRelease();

  mkdirSync(OUT_DIR, { recursive: true });

  for (const [i, city] of cities.entries()) {
    console.log(`\n${city.name} (${city.nameJa})  bbox ${city.bbox.join(", ")}`);

    if (args["list-categories"]) {
      const counts =
        engine === "duckdb" && release
          ? listCategoriesViaDuckdb(city, release)
          : await countCategories(overtureFile ?? overtureViaCli(city, release));
      for (const { category, n } of counts) {
        const mark = CATEGORY_RE.test(category) ? color.green(" ← matched") : "";
        console.log(`  ${String(n).padStart(6)}  ${category}${mark}`);
      }
      continue;
    }

    const candidates: Candidate[] = [];
    if (useOverture) {
      try {
        const records: OvertureRecord[] = [];
        if (engine === "duckdb" && release) records.push(...overtureViaDuckdb(city, release));
        else {
          const path = overtureFile ?? overtureViaCli(city, release);
          for await (const r of readOvertureFile(path)) records.push(r);
          if (!overtureFile) rmSync(path, { force: true });
        }
        const found = records.map((r) => overtureCandidate(r, shops)).filter((c): c is Candidate => c !== null);
        console.log(`  Overture: ${found.length} candidate(s) from ${records.length} record(s)`);
        candidates.push(...found);
      } catch (error) {
        console.warn(color.yellow(`  Overture failed: ${describeError(error)}`));
      }
    }
    if (useOsm) {
      if (i > 0) await sleep(2000); // be polite to the public Overpass server
      try {
        const found = await osmCandidates(city, shops);
        console.log(`  OpenStreetMap: ${found.length} candidate(s)`);
        candidates.push(...found);
      } catch (error) {
        console.warn(color.yellow(`  OpenStreetMap failed: ${describeError(error)}`));
      }
    }

    // New category matches first, name-only matches next, already-listed shops last.
    const rank = (c: Candidate) => (c.alreadyListed ? 2 : c.matchedBy === "category" ? 0 : 1);
    candidates.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    const file = new URL(`${city.slug}.json`, OUT_DIR);
    writeFileSync(
      file,
      `${JSON.stringify(
        {
          city: city.name,
          bbox: city.bbox,
          generatedAt: new Date().toISOString(),
          overture: useOverture ? { engine, release: release ?? (overtureFile ? "from file" : "latest") } : null,
          osm: useOsm ? { endpoint: OVERPASS_URL } : null,
          notice:
            "Leads for manual review only. Never copy these into shops.json without checking each place yourself. " +
            "OSM records are ODbL (share-alike): if a shop entry is copied substantially from one, set dataSource to \"osm\". " +
            "Overture records carry their own license per source (mostly CDLA Permissive 2.0).",
          candidates,
        },
        null,
        2,
      )}\n`,
    );
    const listed = candidates.filter((c) => c.alreadyListed).length;
    console.log(color.green(`  ✔ data/candidates/${city.slug}.json: ${candidates.length} lead(s), ${listed} already listed`));
  }
}

async function countCategories(path: string): Promise<Array<{ category: string; n: number }>> {
  const counts = new Map<string, number>();
  for await (const r of readOvertureFile(path)) {
    const hierarchy = r.taxonomy?.hierarchy ?? [];
    const primary = r.taxonomy?.primary ?? r.categories?.primary;
    if (!primary || (hierarchy.length && !hierarchy.includes("food_and_drink"))) continue;
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  return [...counts].map(([category, n]) => ({ category, n })).sort((a, b) => b.n - a.n).slice(0, 80);
}

main().catch((error: unknown) => {
  console.error(color.red(`✖ ${describeError(error)}`));
  process.exit(1);
});
