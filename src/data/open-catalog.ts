import { CITIES } from "./cities.ts";
import type { Shop } from "./schema.ts";
import { inferCuisine } from "../cuisines.ts";
import { prefectureByCode } from "./prefectures.ts";
import { STYLE_BY_ID, brothFromStyles, type StyleTag } from "./styles.ts";

/**
 * Compact, redistributable records; never invent missing menu or price data.
 * Contact details and addresses are copied from the source record. Prefecture, style
 * and chain are derived during import, with that provenance kept in the UI.
 */
export interface OpenPlace {
  id: string;
  name: string;
  nameJa: string;
  nameRomanized?: string;
  /** "brand": the chain's own English name (plus a romanized branch), not a reading. */
  nameSource?: "brand";
  localityRomanized?: string;
  lat: number;
  lng: number;
  locality: string;
  category: string;
  licenses: string[];
  /** JIS prefecture code (1–47), from the source region, address or postcode. */
  prefecture?: number;
  /** Style tags suggested by the shop's own name (see styles.ts). */
  styles?: string[];
  /** Brand shared by 6+ locations in 3+ municipalities. */
  chain?: string;
  address?: string;
  postcode?: string;
  /** E.164, e.g. +81312345678. */
  phone?: string;
  website?: string;
  socials?: string[];
  /** Overture's 0–1 estimate that the place exists. */
  confidence?: number;
}

const httpUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  try { return /^https?:$/.test(new URL(value).protocol) ? value : undefined; } catch { return undefined; }
};

export function openPlaceToShop(place: OpenPlace): Shop {
  const city = CITIES.find(c => place.lng >= c.bbox[0] && place.lat >= c.bbox[1]
    && place.lng <= c.bbox[2] && place.lat <= c.bbox[3]);
  const styles = (place.styles ?? []).map(id => STYLE_BY_ID.get(id)).filter((s): s is StyleTag => !!s);
  const category = `${place.category} ${place.name} ${place.nameJa}`.toLowerCase();
  // Broad ramen categories do not tell us whether the broth is shoyu, miso, etc.
  // Only the shop's own name can (味噌ラーメン), and that is recorded as a suggestion.
  const named = brothFromStyles(styles);
  const broth = named ?? (/udon|うどん|饂飩/.test(category) ? "udon"
    : /soba|蕎麦/.test(category) && !/中華そば|yakisoba/.test(category) ? "soba"
    : /oden|おでん/.test(category) ? "oden" : "other");
  const prefecture = place.prefecture ? prefectureByCode.get(place.prefecture) : undefined;
  // "Chuo, Osaka" → the city is the last part; the ward stays in the locality.
  const municipality = place.localityRomanized?.split(", ").at(-1);
  const socials = (place.socials ?? []).map(httpUrl).filter((u): u is string => !!u);
  return {
    slug: `open-${place.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: place.name,
    nameJa: place.nameJa || place.name,
    nameRomanized: place.nameRomanized,
    ...(place.nameSource ? { nameSource: place.nameSource } : {}),
    cuisine: styles.find(s => s.cuisine)?.cuisine ?? inferCuisine(place.category, `${place.name} ${place.nameJa}`),
    city: city?.name ?? (municipality || place.locality || "Japan"),
    cityCode: "00000",
    neighborhood: place.locality || city?.name || "Japan",
    ...(place.localityRomanized ? { localityRomanized: place.localityRomanized } : {}),
    ...(prefecture ? { prefecture: prefecture.name } : {}),
    lat: place.lat, lng: place.lng, broth,
    ...(named ? { brothSource: "name" as const } : {}),
    ...(styles.length ? { styles: styles.map(s => s.id) } : {}),
    ...(place.chain ? { chain: place.chain } : {}),
    signatureBowl: "Menu not verified",
    priceYen: null, hours: null,
    blurb: "Listed in Overture's open places catalog. Menu, prices, opening hours and current trading status have not been independently verified. Check the shop before visiting.",
    videoUrl: null, photo: { url: null, credit: null, license: null }, splatUrl: null,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.lat},${place.lng}`)}`,
    ...(place.address ? { address: place.address } : {}),
    ...(place.postcode ? { postcode: place.postcode } : {}),
    ...(place.phone && /^\+81\d{9,10}$/.test(place.phone) ? { phone: place.phone } : {}),
    ...(httpUrl(place.website) ? { website: place.website } : {}),
    ...(socials.length ? { socials } : {}),
    dataSource: "overture", sourceId: place.id, verified: false,
    sourceLicenses: place.licenses,
  };
}
