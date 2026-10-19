/** Write the full dataset, the browser core and the per-shop detail shards together. */
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { detailShard, encodeCore, pickDetails, type OpenPlaceDetails } from "../../src/data/catalog-format.ts";
import type { OpenCatalog } from "../../src/data/load-open-catalog.ts";

/** Write next to the target, then rename: a failed run never leaves a half-written file. */
function write(url: URL, value: unknown): void {
  writeFileSync(new URL(`${url.href}.tmp`), gzipSync(JSON.stringify(value), { level: 9 }));
  renameSync(new URL(`${url.href}.tmp`), url);
}

export function writeCatalog(catalog: OpenCatalog, data = new URL("../../public/data/", import.meta.url)): void {
  write(new URL("open-shops.json.gz", data), catalog);
  const { records, ...meta } = catalog;
  write(new URL("open-shops-core.json.gz", data), encodeCore(meta, records));
  const shards = new Map<string, Record<string, OpenPlaceDetails>>();
  for (const place of records) {
    const details = pickDetails(place);
    if (!details) continue;
    const shard = detailShard(place.id);
    shards.set(shard, { ...shards.get(shard), [place.id]: details });
  }
  const dir = new URL("details/", data);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [shard, entries] of shards) write(new URL(`${shard}.json.gz`, dir), entries);
}
