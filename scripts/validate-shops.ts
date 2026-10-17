/**
 * Build-time validation of src/data/shops.json.
 * Fails the build on schema errors; warns about unverified shops and soft issues.
 *
 *   npm run validate
 */
import { readFileSync } from "node:fs";
import { CITIES } from "../src/data/cities.ts";
import { ShopsSchema, type Shop } from "../src/data/schema.ts";
import { SHOPS } from "../src/data/shops.ts";

const PLATEAU_PATH = new URL("../src/data/plateau-tilesets.json", import.meta.url);

const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const raw: unknown = SHOPS;
const parsed = ShopsSchema.safeParse(raw);

if (!parsed.success) {
  console.error(red("✖ shops.json failed validation:"));
  for (const issue of parsed.error.issues) {
    const where = issue.path.length ? issue.path.join(".") : "(root)";
    const shop = typeof issue.path[0] === "number" ? (raw as Array<{ slug?: string }>)[issue.path[0]]?.slug : undefined;
    console.error(`  ${where}${shop ? ` [${shop}]` : ""}: ${issue.message}`);
  }
  process.exit(1);
}

const shops: Shop[] = parsed.data;
const errors: string[] = [];
const warnings: string[] = [];

const seen = new Set<string>();
for (const s of shops) {
  if (seen.has(s.slug)) errors.push(`duplicate slug "${s.slug}"`);
  seen.add(s.slug);

  const city = CITIES.find((c) => c.name === s.city);
  if (!city && !s.slug.startsWith("open-")) {
    errors.push(`${s.slug}: city "${s.city}" is not in src/data/cities.ts`);
  } else if (city) {
    const [w, south, e, n] = city.bbox;
    if (s.lng < w || s.lng > e || s.lat < south || s.lat > n) {
      warnings.push(`${s.slug}: coordinates fall outside the ${city.name} bounding box`);
    }
  }
  if (s.dataSource === "osm") {
    warnings.push(`${s.slug}: dataSource "osm". The shop dataset is now a derivative database under ODbL (see README).`);
  }
  if (s.dataSource !== "manual" && !s.sourceId) {
    warnings.push(`${s.slug}: dataSource "${s.dataSource}" but no sourceId recorded`);
  }
}

let plateauCodes = new Set<string>();
try {
  const plateau = JSON.parse(readFileSync(PLATEAU_PATH, "utf8")) as { tilesets?: Array<{ cityCode: string }> };
  plateauCodes = new Set((plateau.tilesets ?? []).map((t) => t.cityCode));
} catch {
  warnings.push("src/data/plateau-tilesets.json missing or unreadable; Building info will be unavailable");
}
const noPlateau = shops.filter((s) => !plateauCodes.has(s.cityCode));

if (errors.length) {
  console.error(red(`✖ ${errors.length} error(s):`));
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`✔ shops.json: ${shops.length} shops valid`);

const unverified = shops.filter((s) => !s.verified);
if (unverified.length) {
  console.warn(yellow(`⚠ ${unverified.length} unverified shop(s). Verify coordinates, names and details by hand before launch:`));
  for (const s of unverified.slice(0, 15)) console.warn(yellow(`  • ${s.slug} ${dim(`(${s.city}, ${s.lat}, ${s.lng})`)}`));
  if (unverified.length > 15) console.warn(yellow(`  …and ${(unverified.length - 15).toLocaleString()} more unverified open-data listings.`));
}
for (const w of warnings) console.warn(yellow(`⚠ ${w}`));
if (noPlateau.length) {
  console.log(dim(`ℹ ${noPlateau.length.toLocaleString()} shops have no mapped PLATEAU municipality code. Google 3D and shop pins remain available.`));
}
