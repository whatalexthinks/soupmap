/**
 * Turns PLATEAU building properties into plain-English facts. No Cesium dependency.
 *
 * PLATEAU's 3D Tiles carry (per the 2023 conversion spec):
 *   - common properties: meshcode, city_code, city_name, feature_type, gml_id
 *   - `attributes`: a JSON document with every thematic attribute in its CityGML
 *     structure, e.g. "bldg:usage", "uro:BuildingRiverFloodingRiskAttribute": [...]
 *   - selected attributes flattened to top-level properties
 * Older datasets used Japanese property names (用途, 建築年, 計測高さ, …).
 * We read all three shapes, translate codelist values, and never show raw keys.
 * Run the app with ?debug=plateau to log the real property names of a picked building.
 */

export type HazardKind = "river-flood" | "tsunami" | "high-tide" | "inland-flood" | "landslide";

export interface HazardFact {
  kind: HazardKind;
  label: string;
  detail: string;
}

export interface BuildingFacts {
  name?: string;
  usage?: string;
  yearBuilt?: string;
  height?: string;
  storeys?: string;
  structure?: string;
  hazards: HazardFact[];
}

/** bldg:usage (Building_usage.xml), by code and by Japanese label. */
const USAGE: Record<string, string> = {
  "401": "Office", 業務施設: "Office",
  "402": "Commercial", 商業施設: "Commercial",
  "403": "Hotel or lodging", 宿泊施設: "Hotel or lodging",
  "404": "Mixed commercial", 商業系複合施設: "Mixed commercial",
  "411": "House", 住宅: "House",
  "412": "Apartment building", 共同住宅: "Apartment building",
  "413": "House with a shop", 店舗等併用住宅: "House with a shop",
  "414": "Apartments with shops", 店舗等併用共同住宅: "Apartments with shops",
  "415": "House with a workshop", 作業所併用住宅: "House with a workshop",
  "421": "Government", 官公庁施設: "Government",
  "422": "Education, culture or welfare", 文教厚生施設: "Education, culture or welfare",
  "431": "Transport or warehouse", 運輸倉庫施設: "Transport or warehouse",
  "441": "Factory", 工場: "Factory",
  "451": "Farming, forestry or fishery", 農林漁業用施設: "Farming, forestry or fishery",
  "452": "Utilities", 供給処理施設: "Utilities",
  "453": "Defence", 防衛施設: "Defence",
  "454": "Other", その他: "Other",
};

/** uro:buildingStructureType */
const STRUCTURE: Record<string, string> = {
  "601": "Wood", "木造・土蔵造": "Wood",
  "602": "Steel-reinforced concrete", 鉄骨鉄筋コンクリート造: "Steel-reinforced concrete",
  "603": "Reinforced concrete", 鉄筋コンクリート造: "Reinforced concrete",
  "604": "Steel frame", 鉄骨造: "Steel frame",
  "605": "Light steel frame", 軽量鉄骨造: "Light steel frame",
  "606": "Brick, block or stone", "レンガ造・コンクリートブロック造・石造": "Brick, block or stone",
  "610": "Non-wooden", 非木造: "Non-wooden",
};

/** Flood-type depth ranks (RiverFloodingRisk_rank etc.). */
const DEPTH_RANK: Record<string, string> = {
  "1": "under 0.5 m",
  "2": "0.5–3 m",
  "3": "3–5 m",
  "4": "5–10 m",
  "5": "10–20 m",
  "6": "over 20 m",
};

const SCALE: Record<string, string> = {
  L1: "planned-scale flood",
  L2: "maximum assumed flood",
  計画規模: "planned-scale flood",
  想定最大規模: "maximum assumed flood",
};

const LANDSLIDE_TYPE: Record<string, string> = {
  "1": "Steep-slope collapse", 急傾斜地の崩落: "Steep-slope collapse",
  "2": "Debris flow", 土石流: "Debris flow",
  "3": "Landslide", 地すべり: "Landslide",
};

const LANDSLIDE_ZONE: Record<string, string> = {
  "1": "warning zone", 警戒区域: "warning zone", 土砂災害警戒区域: "warning zone",
  "2": "special warning zone", 特別警戒区域: "special warning zone", 土砂災害特別警戒区域: "special warning zone",
};

const HAZARD_LABEL: Record<HazardKind, string> = {
  "river-flood": "River flooding",
  tsunami: "Tsunami",
  "high-tide": "Storm surge",
  "inland-flood": "Inland flooding",
  landslide: "Landslide risk",
};

const HAZARD_KEYS: Array<[RegExp, HazardKind]> = [
  [/RiverFloodingRisk/i, "river-flood"],
  [/TsunamiRisk/i, "tsunami"],
  [/HighTideRisk/i, "high-tide"],
  [/InlandFloodingRisk/i, "inland-flood"],
  [/LandSlideRisk/i, "landslide"],
];

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** "bldg:measuredHeight" → "measuredHeight"; "uro:rank" → "rank". */
const localName = (key: string) => key.slice(key.lastIndexOf(":") + 1);

function isUnknown(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  const s = String(value).trim();
  return ["-9999", "9999", "0001", "-1", "不明", "unknown", "Unknown"].includes(s);
}

function text(value: unknown): string | undefined {
  if (isUnknown(value)) return undefined;
  if (typeof value === "object") return undefined;
  return String(value).trim();
}

/** Depth rank text like "0.5m以上3m未満" → "0.5–3 m". */
export function translateRank(value: unknown): string | undefined {
  const s = text(value);
  if (!s) return undefined;
  if (DEPTH_RANK[s]) return DEPTH_RANK[s];
  const range = s.match(/([\d.]+)\s*m以上\s*([\d.]+)\s*m未満/);
  if (range) return `${range[1]}–${range[2]} m`;
  const under = s.match(/([\d.]+)\s*m未満/);
  if (under) return `under ${under[1]} m`;
  const over = s.match(/([\d.]+)\s*m以上/);
  if (over) return `over ${over[1]} m`;
  return undefined;
}

/** Depth-ordering for picking the worst of several flood scenarios. */
function rankWeight(rank: string | undefined, depth: number | undefined): number {
  if (depth !== undefined) return depth;
  if (!rank) return -1;
  const nums = rank.match(/[\d.]+/g)?.map(Number) ?? [];
  return rank.startsWith("over") ? (nums[0] ?? 0) + 1 : (nums.at(-1) ?? 0) - 0.01;
}

/** Walks a parsed `attributes` document, yielding [key, value] for every property. */
function* walk(node: Json, path: string[] = []): Generator<[string[], Json]> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item, path);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      yield [[...path, key], value];
      yield* walk(value, [...path, key]);
    }
  }
}

function parseAttributes(value: unknown): Json | undefined {
  if (value && typeof value === "object") return value as Json;
  if (typeof value !== "string" || !value.trim().startsWith("{")) return undefined;
  try {
    return JSON.parse(value) as Json;
  } catch {
    return undefined;
  }
}

/**
 * @param props every property of the picked feature (key → value)
 */
export function readBuildingFacts(props: Record<string, unknown>): BuildingFacts {
  const nested = parseAttributes(props.attributes);
  const pairs: Array<[string, unknown]> = Object.entries(props).filter(([k]) => k !== "attributes");
  if (nested) for (const [path, value] of walk(nested)) pairs.push([path.join("/"), value]);

  /** First scalar value whose key's local name matches, flat keys first. */
  const pick = (...names: string[]): unknown => {
    for (const name of names) {
      for (const [key, value] of pairs) {
        const last = key.split("/").at(-1) ?? key;
        if ((localName(last) === name || last === name) && typeof value !== "object") {
          if (!isUnknown(value)) return value;
        }
      }
    }
    return undefined;
  };

  const facts: BuildingFacts = { hazards: [] };

  facts.name = text(pick("name", "名称", "gml:name"));

  const usage = text(pick("usage", "用途", "orgUsage"));
  if (usage) facts.usage = USAGE[usage] ?? undefined;

  const year = text(pick("yearOfConstruction", "建築年"));
  if (year && /^\d{4}$/.test(year) && Number(year) > 1000) facts.yearBuilt = year;

  const height = Number(pick("measuredHeight", "計測高さ"));
  if (Number.isFinite(height) && height > 0 && height < 1000) facts.height = `${height.toFixed(1)} m`;

  const above = Number(pick("storeysAboveGround", "地上階数"));
  const below = Number(pick("storeysBelowGround", "地下階数"));
  const storeyParts: string[] = [];
  if (Number.isInteger(above) && above > 0 && above < 300) storeyParts.push(`${above} above ground`);
  if (Number.isInteger(below) && below > 0 && below < 50) storeyParts.push(`${below} below`);
  if (storeyParts.length) facts.storeys = storeyParts.join(", ");

  const structure = text(pick("buildingStructureType", "構造種別"));
  if (structure && STRUCTURE[structure]) facts.structure = STRUCTURE[structure];

  facts.hazards = readHazards(nested, pairs);
  return facts;
}

function readHazards(nested: Json | undefined, flat: Array<[string, unknown]>): HazardFact[] {
  const found = new Map<HazardKind, { fact: HazardFact; weight: number }>();
  const offer = (kind: HazardKind, detail: string, weight: number) => {
    const current = found.get(kind);
    if (!current || weight > current.weight) found.set(kind, { fact: { kind, label: HAZARD_LABEL[kind], detail }, weight });
  };

  // 1. Structured: the `attributes` document (uro:Building…RiskAttribute objects).
  const groups: Array<[HazardKind, Record<string, Json>]> = [];
  if (nested) {
    for (const [path, value] of walk(nested)) {
      const key = path.at(-1) ?? "";
      const kind = HAZARD_KEYS.find(([re]) => re.test(key))?.[1];
      if (!kind) continue;
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) if (item && typeof item === "object" && !Array.isArray(item)) groups.push([kind, item]);
    }
  }
  for (const [kind, item] of groups) describe(kind, (name) => findLocal(item, name), offer);

  // 2. Flattened top-level keys: "uro:BuildingRiverFloodingRiskAttribute_uro:rank", etc.
  for (const [re, kind] of HAZARD_KEYS) {
    const related = flat.filter(([k]) => re.test(k));
    if (related.length) describe(kind, (name) => related.find(([k]) => localName(k).endsWith(name))?.[1], offer);
  }

  // 3. Older Japanese keys: "…_浸水ランク", "…_浸水深", "土砂災害…".
  for (const [key, value] of flat) {
    if (/浸水ランク|浸水深/.test(key)) {
      const kind: HazardKind = /津波/.test(key) ? "tsunami" : /高潮/.test(key) ? "high-tide" : /内水/.test(key) ? "inland-flood" : "river-flood";
      const depth = /浸水深/.test(key) ? Number(value) : undefined;
      const rank = /浸水ランク/.test(key) ? translateRank(value) : undefined;
      const scale = Object.entries(SCALE).find(([ja]) => key.includes(ja))?.[1];
      const detail = depthDetail(rank, depth, scale);
      if (detail) offer(kind, detail, rankWeight(rank, depth));
    } else if (/土砂災害/.test(key) && !isUnknown(value)) {
      const zone = LANDSLIDE_ZONE[String(value)] ?? LANDSLIDE_ZONE[key.replace(/_.*$/, "")];
      if (zone) offer("landslide", `In a ${zone}`, zone.startsWith("special") ? 2 : 1);
    }
  }

  return [...found.values()].map((v) => v.fact);
}

function findLocal(item: Record<string, Json>, name: string): Json | undefined {
  for (const [key, value] of Object.entries(item)) if (localName(key) === name) return value;
  return undefined;
}

function depthDetail(rank: string | undefined, depth: number | undefined, scale: string | undefined): string | undefined {
  const parts: string[] = [];
  if (depth !== undefined && Number.isFinite(depth) && depth > 0) parts.push(`up to ${depth.toFixed(1)} m deep`);
  else if (rank) parts.push(`depth ${rank}`);
  if (!parts.length) return undefined;
  if (scale) parts.push(`(${scale})`);
  return parts.join(" ");
}

function describe(
  kind: HazardKind,
  get: (name: string) => unknown,
  offer: (kind: HazardKind, detail: string, weight: number) => void,
): void {
  if (kind === "landslide") {
    const type = LANDSLIDE_TYPE[String(get("description") ?? "")];
    const zone = LANDSLIDE_ZONE[String(get("areaType") ?? "")];
    if (!type && !zone) return;
    const detail = [type, zone ? `${type ? "" : "In a "}${zone}` : undefined].filter(Boolean).join(", ");
    offer(kind, detail, zone?.startsWith("special") ? 2 : 1);
    return;
  }
  const rank = translateRank(get("rank") ?? get("rankOrg"));
  const depthValue = Number(get("depth"));
  const depth = Number.isFinite(depthValue) && depthValue > 0 ? depthValue : undefined;
  const scale = SCALE[String(get("scale") ?? "")];
  const detail = depthDetail(rank, depth, scale);
  if (detail) offer(kind, detail, rankWeight(rank, depth));
}
