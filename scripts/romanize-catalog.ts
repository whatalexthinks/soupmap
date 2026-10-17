/** Add reproducible, approximate Latin readings to the existing attributed catalog. */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { createRomanizer } from "./lib/romanize.ts";
import type { OpenCatalog } from "../src/data/load-open-catalog.ts";
import { hasJapanese } from "../src/names.ts";

const path = new URL("../public/data/open-shops.json.gz", import.meta.url);
const catalog = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as OpenCatalog;
const romanize = await createRomanizer();
let romanized = 0, unavailable = 0;
for (const place of catalog.records) {
  place.nameRomanized = romanize(place.name);
  place.localityRomanized = romanize(place.locality);
  if (place.nameRomanized) ++romanized;
  else if (hasJapanese(place.name)) ++unavailable;
}
const temp = new URL(`${path.href}.tmp`);
writeFileSync(temp,gzipSync(JSON.stringify(catalog),{level:9}));
renameSync(temp,path);
console.log(`Generated approximate readings for ${romanized} shop names; ${unavailable} names retain Japanese because no reliable reading was found.`);
