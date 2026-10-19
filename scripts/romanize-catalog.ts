/** Refresh English names in the existing attributed catalog without downloading a new extract. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRomanizer, localityNamer } from "./lib/romanize.ts";
import { matchBrand } from "./lib/brands.ts";
import { writeCatalog } from "./lib/catalog-output.ts";
import type { OpenCatalog } from "../src/data/load-open-catalog.ts";
import { hasJapanese } from "../src/names.ts";

const path = new URL("../public/data/open-shops.json.gz", import.meta.url);
const catalog = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8")) as OpenCatalog;
const romanize = await createRomanizer();
const placeName = localityNamer(romanize);
let romanized = 0, branded = 0, unavailable = 0;
for (const place of catalog.records) {
  const brand = matchBrand(place.nameJa);
  delete place.nameSource;
  if (brand) {
    const branch = brand.rest ? romanize(brand.rest) ?? (hasJapanese(brand.rest) ? "" : brand.rest) : "";
    place.nameRomanized = [brand.english, branch].filter(Boolean).join(" ");
    place.nameSource = "brand";
    ++branded;
  } else {
    place.nameRomanized = romanize(place.name);
  }
  place.localityRomanized = placeName(place.locality);
  if (place.nameRomanized) ++romanized;
  else if (hasJapanese(place.name)) ++unavailable;
}
writeCatalog(catalog);
console.log(`English names for ${romanized} shops (${branded} chain brand names); ${unavailable} names retain Japanese because no reliable reading was found.`);
