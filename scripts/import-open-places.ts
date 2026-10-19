/**
 * Build the redistributable catalog from an actual Overture extract.
 * node --import tsx scripts/import-open-places.ts --input /tmp/soupmap-overture.json [--min-confidence 0.3]
 *
 * Everything added here comes from the source record itself (contact details, address,
 * brand) or is derived from it with stated provenance (prefecture from the postcode,
 * style from the shop's own name, chain from repeated brand names). Nothing is invented.
 */
import { readFileSync } from "node:fs";
import { parseArgs, distanceM, loadShops } from "./lib/util.ts";
import { openPlaceToShop, type OpenPlace } from "../src/data/open-catalog.ts";
import { ShopsSchema } from "../src/data/schema.ts";
import { writeCatalog } from "./lib/catalog-output.ts";
import { inferStyles } from "../src/data/styles.ts";
import { createRomanizer, localityNamer } from "./lib/romanize.ts";
import { matchBrand } from "./lib/brands.ts";
import { correctOutliers, fillByNeighbours, prefectureFromPostcode, prefectureFromText } from "./lib/prefecture.ts";

const args = parseArgs(process.argv.slice(2));
if (typeof args.input !== "string") throw new Error("--input must point to an Overture extract");
const minConfidence = Number(args["min-confidence"] ?? 0.3);

interface RawPlace {
  id: string; names: { primary: string; common?: Record<string, string> | null };
  lat: number; lng: number; confidence?: number | null;
  taxonomy?: { primary?: string } | null;
  addresses?: Array<{ freeform?: string | null; locality?: string | null; postcode?: string | null; region?: string | null; country?: string | null }> | null;
  sources?: Array<{ license?: string | null }> | null;
  websites?: string[] | null; socials?: string[] | null; phones?: string[] | null;
  brand?: { names?: { primary?: string | null } | null } | null;
}
const source = JSON.parse(readFileSync(args.input, "utf8")) as { release: string; records: RawPlace[] };
if (!source.records?.length) throw new Error("Empty source; refusing to replace the catalog");

/** Aggregators and review sites are not the shop's own website (and we never scrape them). */
const NOT_OFFICIAL = /(^|\.)(tabelog\.com|gnavi\.co\.jp|hotpepper\.jp|retty\.me|ubereats\.com|demae-can\.com|ekiten\.jp|localplace\.jp|google\.[a-z.]+|goo\.gl|yelp\.[a-z.]+|tripadvisor\.[a-z.]+|menu\.jp|epark\.jp|hitosara\.com|favy\.jp|food\.rakuten\.co\.jp)$/i;
const SOCIAL = /(^|\.)(instagram\.com|twitter\.com|x\.com|facebook\.com|tiktok\.com)$/i;
function cleanUrl(raw: string): URL | undefined {
  try {
    const url = new URL(raw.trim());
    return /^https?:$/.test(url.protocol) && url.hostname.includes(".") && raw.length <= 300 ? url : undefined;
  } catch { return undefined; }
}

const curated = loadShops();
const romanize = await createRomanizer();
const placeName = localityNamer(romanize);
const seenIds = new Set<string>();
const locations = new Map<string, OpenPlace[]>();
const records: OpenPlace[] = [];
/** Side data used only while importing: the source brand string and our English brand name. */
const brandOf = new Map<OpenPlace, { source?: string; english?: string }>();
const excluded = { license: 0, invalid: 0, confidence: 0, curated: 0, duplicate: 0 };
const normalize = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
const round = (v: number) => Math.round(v * 1e6) / 1e6;

for (const raw of source.records) {
  const licenses = [...new Set((raw.sources ?? []).map(s => s.license).filter((s): s is string => !!s))];
  // Only redistribute records whose supplied sources have explicitly supported licenses.
  if (!licenses.length || licenses.some(l => !/^(CDLA[- ]Permissive[- ]2\.0|Apache[- ]2\.0)$/i.test(l))) { excluded.license++; continue; }
  const address = raw.addresses?.find(a => a?.country === "JP");
  if (!raw.id || !raw.names?.primary || !Number.isFinite(raw.lat) || !Number.isFinite(raw.lng) || !address || seenIds.has(raw.id)) {
    excluded.invalid++; continue;
  }
  // Overture's confidence estimates whether the place exists; very low scores are usually stale.
  if (typeof raw.confidence === "number" && raw.confidence < minConfidence) { excluded.confidence++; continue; }
  const name = raw.names.common?.en || raw.names.primary;
  const nameJa = raw.names.common?.ja || raw.names.primary;
  const names = [name, nameJa].map(normalize);
  const matches = (s: { name: string; nameJa: string; lat: number; lng: number }) =>
    distanceM(raw.lat, raw.lng, s.lat, s.lng) < 75
    && [normalize(s.name), normalize(s.nameJa)].some(n => names.some(m => n === m || (Math.min(n.length, m.length) >= 4 && (n.includes(m) || m.includes(n)))));
  if (curated.some(matches)) { excluded.curated++; continue; }
  const key = normalize(nameJa);
  if ((locations.get(key) ?? []).some(matches)) { excluded.duplicate++; continue; }

  const place: OpenPlace = {
    id: raw.id, name, nameJa, lat: round(raw.lat), lng: round(raw.lng),
    locality: address.locality || "",
    category: raw.taxonomy?.primary || "soup_restaurant", licenses,
  };
  // English: the chain's own brand name where we know it, otherwise an approximate reading.
  const brand = matchBrand(nameJa);
  if (brand) {
    const branch = brand.rest ? (romanize(brand.rest) ?? (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(brand.rest) ? "" : brand.rest)) : "";
    place.nameRomanized = [brand.english, branch].filter(Boolean).join(" ");
    place.nameSource = "brand";
    brandOf.set(place, { english: brand.english });
  } else {
    place.nameRomanized = romanize(name);
  }
  place.localityRomanized = placeName(place.locality);
  const styles = inferStyles(nameJa).map(s => s.id);
  if (styles.length) place.styles = styles;
  place.prefecture = prefectureFromText(address.region ?? undefined)
    ?? prefectureFromText(address.freeform ?? undefined) ?? prefectureFromPostcode(address.postcode ?? undefined);
  if (address.freeform?.trim()) place.address = address.freeform.trim().slice(0, 160);
  if (address.postcode && /^\d{3}-?\d{4}$/.test(address.postcode.normalize("NFKC"))) {
    place.postcode = address.postcode.normalize("NFKC").replace(/^(\d{3})(\d{4})$/, "$1-$2");
  }
  const phone = raw.phones?.map(p => p.replace(/[\s()-]/g, "")).find(p => /^\+81\d{9,10}$/.test(p));
  if (phone) place.phone = phone;
  const urls = [...(raw.websites ?? []), ...(raw.socials ?? [])].map(cleanUrl).filter((u): u is URL => !!u);
  const website = urls.find(u => !SOCIAL.test(u.hostname) && !NOT_OFFICIAL.test(u.hostname));
  if (website) place.website = website.href;
  const socials = [...new Set(urls.filter(u => SOCIAL.test(u.hostname)).map(u => u.href))].slice(0, 3);
  if (socials.length) place.socials = socials;
  if (typeof raw.confidence === "number") place.confidence = Math.round(raw.confidence * 100) / 100;
  brandOf.set(place, { ...brandOf.get(place), source: raw.brand?.names?.primary ?? undefined });
  seenIds.add(raw.id);
  locations.set(key, [...(locations.get(key) ?? []), place]);
  records.push(place);
}
if (!records.length) throw new Error("No eligible records; existing catalog was not changed");

// Prefecture: postcode/address first, then the 7 nearest labelled neighbours.
const corrected = correctOutliers(records);
const filled = fillByNeighbours(records);

// Chains: the same brand at 6+ locations in 3+ municipalities. Generic words never count.
/** A place or style plus a noodle word ("サッポロラーメン", "手打ちうどん") names a style, not a chain. */
const GENERIC = /^(?:元祖|本場|手打ち?|自家製麺)?(?:札幌|サッポロ|さっぽろ|博多|長浜|熊本|久留米|尾道|徳島|和歌山|喜多方|旭川|函館|横浜|横浜家系|家系|東京|京都|大阪|名古屋|富山|鹿児島|沖縄|讃岐|さぬき|味噌|醤油|塩|豚骨|とんこつ|中華)?(?:ラーメン|らーめん|拉麺|中華そば|うどん|そば|蕎麦|おでん|ちゃんぽん|つけ麺|担々麺|食堂)(?:屋|店|ショップ|処)?$|^(?:そば処|うどん屋|ラーメンショップ)$/;
const chainKey = (p: OpenPlace): string | undefined => {
  const brand = brandOf.get(p);
  if (brand?.english) return brand.english;
  const base = (brand?.source || p.nameJa || p.name).normalize("NFKC")
    .replace(/[(（][^)）]*[)）]/g, "").replace(/\s+\S*店$/, "").replace(/\s+/g, "").trim();
  return base.length >= 3 && !GENERIC.test(base) ? base : undefined;
};
const groups = new Map<string, OpenPlace[]>();
for (const p of records) {
  const k = chainKey(p);
  if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
}
let chains = 0;
for (const [k, members] of groups) {
  if (members.length < 6 || new Set(members.map(m => m.locality)).size < 3) continue;
  chains++;
  // A source brand like "風風ラーメン牛久西口店" names one branch; keep the part all members share.
  let shared = k;
  if (/店$/.test(k) && !/本店$/.test(k)) {
    const names = members.map(m => m.nameJa.normalize("NFKC").replace(/\s+/g, ""));
    let length = 0;
    while (names.every(n => n[length] !== undefined && n[length] === names[0]![length])) length++;
    if (length >= 3) shared = names[0]!.slice(0, length);
  }
  const display = brandOf.get(members[0]!)?.english ?? romanize(shared) ?? shared;
  for (const m of members) m.chain = display;
}

records.sort((a, b) => a.id.localeCompare(b.id));
ShopsSchema.parse(records.map(openPlaceToShop));
const catalog = { release: source.release, generatedAt: new Date().toISOString(),
  attribution: "© Overture Maps Foundation and its data providers",
  notice: "Open-data listings, not editorial recommendations. Coverage is incomplete. See each record's licenses. "
    + "Contact details and addresses come from the source record; prefectures are derived from postcodes; "
    + "styles are suggested by shop names; chains are inferred from repeated brand names.",
  records };
writeCatalog(catalog);
const pct = (n: number) => `${(100 * n / records.length).toFixed(0)}%`;
console.log(`Imported ${records.length} source-attributed shops. Excluded: ${JSON.stringify(excluded)}.`);
console.log(`Prefecture known for ${pct(records.filter(r => r.prefecture).length)} (${filled} from neighbours, ${corrected} outliers corrected); `
  + `style hints ${pct(records.filter(r => r.styles).length)}; chains ${chains} covering ${pct(records.filter(r => r.chain).length)}; `
  + `websites ${pct(records.filter(r => r.website).length)}; phones ${pct(records.filter(r => r.phone).length)}; addresses ${pct(records.filter(r => r.address).length)}.`);
