import { CITIES } from "./cities.ts";
import type { Shop } from "./schema.ts";
import { inferCuisine } from "../cuisines.ts";

/** Compact, redistributable records; never invent missing menu or price data. */
export interface OpenPlace {
  id: string;
  name: string;
  nameJa: string;
  nameRomanized?: string;
  localityRomanized?: string;
  lat: number;
  lng: number;
  locality: string;
  category: string;
  licenses: string[];
}

export function openPlaceToShop(place: OpenPlace): Shop {
  const city = CITIES.find(c => place.lng >= c.bbox[0] && place.lat >= c.bbox[1]
    && place.lng <= c.bbox[2] && place.lat <= c.bbox[3]);
  const category = `${place.category} ${place.name} ${place.nameJa}`.toLowerCase();
  // Broad ramen categories do not tell us whether the broth is shoyu, miso, etc.
  const broth = /udon|うどん|饂飩/.test(category) ? "udon"
    : /soba|蕎麦/.test(category) && !/中華そば|yakisoba/.test(category) ? "soba"
    : /oden|おでん/.test(category) ? "oden" : "other";
  return {
    slug: `open-${place.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: place.name,
    nameJa: place.nameJa || place.name,
    nameRomanized: place.nameRomanized,
    cuisine: inferCuisine(place.category, `${place.name} ${place.nameJa}`),
    city: city?.name ?? (place.localityRomanized || place.locality || "Japan"),
    cityCode: "00000",
    neighborhood: place.locality || city?.name || "Japan",
    lat: place.lat, lng: place.lng, broth,
    signatureBowl: "Menu not verified",
    priceYen: null, hours: null,
    blurb: "Listed in Overture's open places catalog. Menu, prices, opening hours and current trading status have not been independently verified. Check the shop before visiting.",
    videoUrl: null, photo: { url: null, credit: null, license: null }, splatUrl: null,
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.lat},${place.lng}`)}`,
    dataSource: "overture", sourceId: place.id, verified: false,
    sourceLicenses: place.licenses,
  };
}
