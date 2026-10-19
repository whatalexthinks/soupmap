import type { OpenPlace } from "./open-catalog.ts";
import { decodeCore, detailShard, type CoreCatalog, type OpenPlaceDetails } from "./catalog-format.ts";

export interface OpenCatalog {
  release: string;
  generatedAt: string;
  attribution: string;
  notice: string;
  records: OpenPlace[];
}

export async function catalogResponseText(response: Response): Promise<string> {
  if (!response.ok) throw new Error("Open-data catalog could not load. Reload to retry.");
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
  // Vite/CDNs may set Content-Encoding: gzip, which browsers already decode.
  // Static file hosts may instead serve the raw .gz. Support both explicitly.
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Compressed at rest and in transit; no multi-megabyte raw data in Git. Browsers load
 * the compact core (map and search fields); Node (build, tests) reads the full dataset.
 */
export async function loadOpenCatalog(): Promise<OpenCatalog> {
  let catalog: OpenCatalog;
  if (typeof window === "undefined") {
    // Node-only build/tests path. Variable imports keep Node modules out of browser bundles.
    const fsModule = "node:fs/promises";
    const zipModule = "node:zlib";
    const { readFile } = await import(/* @vite-ignore */ fsModule);
    const { gunzipSync } = await import(/* @vite-ignore */ zipModule);
    const bytes = await readFile(new URL("../../public/data/open-shops.json.gz", import.meta.url));
    catalog = JSON.parse(gunzipSync(bytes).toString("utf8")) as OpenCatalog;
  } else {
    const core = JSON.parse(await catalogResponseText(await fetch("/data/open-shops-core.json.gz"))) as CoreCatalog;
    const { rows: _rows, categories: _c, licenseSets: _l, version: _v, ...meta } = core;
    catalog = { ...meta, records: decodeCore(core) };
  }
  if (!Array.isArray(catalog.records) || !catalog.records.length) throw new Error("Open-data catalog is empty or invalid.");
  return catalog;
}

const shards = new Map<string, Promise<Record<string, OpenPlaceDetails>>>();

/** Contact details for one open-data shop, fetched with its shard on first use. */
export async function loadPlaceDetails(sourceId: string): Promise<OpenPlaceDetails | undefined> {
  const shard = detailShard(sourceId);
  let request = shards.get(shard);
  if (!request) {
    request = fetch(`/data/details/${shard}.json.gz`)
      .then(catalogResponseText).then(text => JSON.parse(text) as Record<string, OpenPlaceDetails>);
    shards.set(shard, request);
    // A failed fetch must not poison the cache; the next card open retries.
    request.catch(() => shards.delete(shard));
  }
  return (await request)[sourceId];
}
