/**
 * Japanese municipalities with English names read from their official kana
 * (scripts/build-municipalities.ts; source: localgovjp, CC0). Used to place catalog
 * shops in a city for the guides, instead of the catalog's generated romanizations.
 */
import raw from "./municipalities.json" with { type: "json" };
import { PREFECTURES, prefectureByCode } from "./prefectures.ts";
import type { Shop } from "./schema.ts";

export type MunicipalityKind = "city" | "ward" | "special-ward" | "town" | "village";

export interface Municipality {
  /** 5-digit local government code without the check digit, e.g. "40203". */
  code: string;
  prefecture: number;
  nameJa: string;
  /** "Kurume"; a designated city's ward is just "Chuo". */
  name: string;
  kind: MunicipalityKind;
  lat: number;
  lng: number;
  /** A ward's designated city. */
  parent?: string;
}

type Row = [string, number, string, string, MunicipalityKind, number, number, string?];

export const MUNICIPALITIES: readonly Municipality[] = (raw as Row[]).map(([code, prefecture, nameJa, name, kind, lat, lng, parent]) =>
  ({ code, prefecture, nameJa, name, kind, lat, lng, ...(parent ? { parent } : {}) }));

export const municipalityByCode: ReadonlyMap<string, Municipality> = new Map(MUNICIPALITIES.map(m => [m.code, m]));

const fold = (name: string) => name.normalize("NFKC").replace(/ヶ/g, "ケ").replace(/\s+/g, "");
const byName = new Map<string, Municipality[]>();
for (const m of MUNICIPALITIES) {
  const key = fold(m.nameJa);
  byName.set(key, [...(byName.get(key) ?? []), m]);
}
const prefectureByName = new Map(PREFECTURES.map(p => [p.name, p.code]));
const ascii = (name: string) => name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/-(?:shi|ku|cho|machi|mura)$/, "").replace(/[^a-z]/g, "");
const byEnglish = new Map<string, Municipality[]>();
for (const m of MUNICIPALITIES) {
  if (m.kind !== "city" && m.kind !== "special-ward") continue;
  const key = `${m.prefecture}|${ascii(m.name)}`;
  byEnglish.set(key, [...(byEnglish.get(key) ?? []), m]);
}

function lookup(locality: string, prefecture: number | undefined): Municipality | undefined {
  const name = fold(locality).replace(/^.+?郡(?=.+[町村]$)/, "");
  const unique = (candidates: readonly Municipality[] = []) => {
    const matches = prefecture ? candidates.filter(m => m.prefecture === prefecture) : candidates;
    // A name shared by two prefectures (府中市) needs the prefecture to decide.
    return matches.length === 1 ? matches[0] : undefined;
  };
  return unique(byName.get(name))
    // Wards renamed since the source was compiled (浜松市中央区, 2024) still place the city.
    ?? unique(byName.get(name.match(/^(.+?市).+区$/)?.[1] ?? ""))
    // A few records name the city in English ("Yokohama", "Nagoya-shi", "Taitō").
    ?? (prefecture ? unique(byEnglish.get(`${prefecture}|${ascii(locality)}`)) : undefined);
}

/**
 * The municipality a shop's Japanese locality names: "札幌市中央区", "千代田区" or
 * "河内郡上三川町" (the 郡 district is dropped). Curated shops carry a real code instead.
 * Returns the ward too when the shop is in a designated city.
 */
export function municipalityOf(shop: Pick<Shop, "cityCode" | "neighborhood" | "prefecture">): { city: Municipality; ward?: Municipality } | undefined {
  const found = (shop.cityCode !== "00000" ? municipalityByCode.get(shop.cityCode) : undefined)
    ?? lookup(shop.neighborhood, shop.prefecture ? prefectureByName.get(shop.prefecture) : undefined);
  if (!found) return undefined;
  if (found.kind === "ward") {
    const city = municipalityByCode.get(found.parent!);
    return city ? { city, ward: found } : undefined;
  }
  return { city: found };
}

/** "Kurume, Fukuoka"; a city that shares its prefecture's name stays "Osaka". */
export function municipalityLabel(m: Municipality): string {
  const prefecture = prefectureByCode.get(m.prefecture)!.name;
  return m.name === prefecture ? m.name : `${m.name}, ${prefecture}`;
}
