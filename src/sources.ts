/**
 * The single registry of every external source Soupmap uses: data, imagery,
 * libraries, fonts and services. The /credits page and the in-map attribution
 * are generated from this file.
 *
 * Rule: no entry here = we don't use it. Adding a dataset or asset means adding
 * it here first, with its license and the exact attribution text.
 *
 * `verify` lists what a human must re-check before launch (mirrored in CHECKLIST.md).
 * Terms change; the dates below are when we last checked.
 */

export type SourceKind = "map" | "imagery" | "poi" | "library" | "font" | "reference" | "service";

/**
 * - live:       streamed to visitors at runtime
 * - fallback:   streamed only when the primary layer is unavailable
 * - build-time: used by our scripts; nothing streamed to visitors
 * - leads:      used only to generate review candidates; not published as-is
 * - planned:    wired for a later phase, not active yet
 */
export type SourceStatus = "live" | "fallback" | "build-time" | "leads" | "planned";

export interface Source {
  id: string;
  name: string;
  nameJa?: string;
  provider: string;
  kind: SourceKind;
  status: SourceStatus;
  usedFor: string;
  url: string;
  license: string;
  licenseUrl: string;
  /** Exact attribution text, shown as-is. */
  attribution: string;
  attributionUrl: string;
  endpoints?: readonly string[];
  notes?: readonly string[];
  verify?: readonly string[];
  checked: string;
}

export const SOURCES = [
  {
    id: "open-meteo", name: "Open-Meteo weather", provider: "Open-Meteo", kind: "service", status: "live",
    usedFor: "Cached current temperature and precipitation for soup-weather widgets. The comfort score is calculated by Soupmap.",
    url: "https://open-meteo.com/", license: "CC BY 4.0 data; hosted API commercial subscription for production",
    licenseUrl: "https://open-meteo.com/en/terms", attribution: "Weather data by Open-Meteo; soup comfort index calculated by Soupmap",
    attributionUrl: "https://open-meteo.com/", endpoints: ["https://api.open-meteo.com/v1/forecast", "https://customer-api.open-meteo.com/v1/forecast"],
    notes: ["Free hosted access is for evaluation/non-commercial use. Production weather requires OPEN_METEO_API_KEY."], checked: "2026-10-27",
  },
  {
    id: "resend", name: "Resend transactional email", provider: "Resend", kind: "service", status: "planned",
    usedFor: "Visitor-requested soup spot and city guide emails, enabled only with a verified sender and server credentials.",
    url: "https://resend.com/", license: "Service terms", licenseUrl: "https://resend.com/legal/terms-of-service",
    attribution: "Transactional email delivered by Resend", attributionUrl: "https://resend.com/", checked: "2026-10-27",
  },
  // ── Opt-in historical context (prebuilt Tokyo pilot) ──────────────────────
  {
    id: "history-wikidata",
    name: "Wikidata historical place metadata",
    provider: "Wikidata contributors",
    kind: "reference",
    status: "build-time",
    usedFor: "Curated Tokyo landmark identities, coordinates and explicitly qualified dates. No runtime Wikidata queries.",
    url: "https://www.wikidata.org/",
    license: "CC0 1.0 (structured data)",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "Wikidata contributors",
    attributionUrl: "https://www.wikidata.org/",
    notes: ["Per-place evidence and check dates are in the optional history snapshot. Unreferenced or conflicting dates are labelled, not silently reconciled. Images are not reused."],
    checked: "2026-10-18",
  },
  {
    id: "history-wikipedia",
    name: "Wikipedia historical context",
    provider: "Wikipedia contributors",
    kind: "reference",
    status: "build-time",
    usedFor: "Short attributed, adapted historical summaries, currently Ebisu, with a checked permanent revision link.",
    url: "https://en.wikipedia.org/wiki/Ebisu,_Shibuya",
    license: "CC BY-SA 4.0 (adapted summaries)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Wikipedia contributors; adapted and shortened by Soupmap; adapted summaries available under CC BY-SA 4.0",
    attributionUrl: "https://en.wikipedia.org/w/index.php?title=Ebisu,_Shibuya&action=history",
    notes: ["Article title, permanent revision, modification notice and license accompany each adaptation. Share-alike applies to the adapted summary, not unrelated shop data. No Wikipedia or Commons images are included."],
    checked: "2026-10-18",
  },
  {
    id: "history-japan-search",
    name: "Japan Search archival metadata",
    provider: "National Diet Library and participating institutions",
    kind: "reference",
    status: "build-time",
    usedFor: "Bibliographic facts and archival leads for Tokyo neighbourhood history; not a blanket license to reuse underlying works.",
    url: "https://jpsearch.go.jp/en/",
    license: "Bibliographic facts only; underlying content rights vary by item",
    licenseUrl: "https://jpsearch.go.jp/en/item/dignl-13095504",
    attribution: "Japan Search; National Diet Library Digital Collections",
    attributionUrl: "https://jpsearch.go.jp/en/item/dignl-13095504",
    notes: ["Only title/publication metadata is used. No book text, thumbnails or scans are reproduced. A publication year is explicitly not a landmark construction date."],
    checked: "2026-10-18",
  },
  {
    id: "history-official",
    name: "Tokyo official heritage and site histories",
    provider: "Tokyo Convention & Visitors Bureau; Ministry of the Environment; Sensoji; Meiji Jingu",
    kind: "reference",
    status: "build-time",
    usedFor: "Fact-checked original Soupmap descriptions and qualified dates, linked to each site's evidence.",
    url: "https://www.gotokyo.org/en/see-and-do/history/index.html",
    license: "Facts only; source prose and images not reproduced",
    licenseUrl: "https://www.gotokyo.org/en/about-tcvb/index.html",
    attribution: "Historical facts: GO TOKYO and the official institutions linked in each history entry; original wording by Soupmap",
    attributionUrl: "https://www.gotokyo.org/en/see-and-do/history/index.html",
    notes: ["Source text and images remain with their rightsholders. History is independent of PLATEAU physical building facts and never inferred from Google imagery. The curated pilot is incomplete."],
    checked: "2026-10-18",
  },
  // ── 3D map ────────────────────────────────────────────────────────────────
  {
    id: "google-3d-tiles",
    name: "Google Photorealistic 3D Tiles",
    provider: "Google Maps Platform (Map Tiles API)",
    kind: "map",
    status: "live",
    usedFor: "Primary photorealistic 3D city layer.",
    url: "https://developers.google.com/maps/documentation/tile/3d-tiles",
    license: "Google Maps Platform Terms of Service",
    licenseUrl: "https://cloud.google.com/maps-platform/terms",
    attribution: "Google (logo and data providers shown in the map)",
    attributionUrl: "https://developers.google.com/maps/documentation/tile/policies",
    endpoints: ["https://tile.googleapis.com/v1/3dtiles/root.json"],
    notes: [
      "Streamed only. We never download, cache, proxy or modify tiles.",
      "Google's logo and data attribution are rendered by CesiumJS and are never hidden or restyled.",
    ],
    verify: ["Re-read the Map Tiles API policies (attribution, caching) before launch."],
    checked: "2026-10-16",
  },
  {
    id: "google-street-view",
    name: "Google Street View Static API",
    provider: "Google Maps Platform",
    kind: "imagery",
    status: "live",
    usedFor: "“Stand outside” panoramas at each shop, rendered as a CesiumJS cube-map panorama.",
    url: "https://developers.google.com/maps/documentation/streetview/overview",
    license: "Google Maps Platform Terms of Service",
    licenseUrl: "https://cloud.google.com/maps-platform/terms",
    attribution: "Google",
    attributionUrl: "https://developers.google.com/maps/documentation/streetview/policies",
    endpoints: [
      "https://maps.googleapis.com/maps/api/streetview/metadata",
      "https://maps.googleapis.com/maps/api/streetview",
    ],
    notes: ["Metadata lookups decide whether to show the button; images load only when a visitor opens the panorama."],
    verify: ["Confirm Street View Static API attribution requirements for custom (non-Google) viewers."],
    checked: "2026-10-16",
  },

  // ── Building intelligence ──────────────────────────────────────────────────
  {
    id: "plateau-buildings",
    name: "Project PLATEAU 3D city models (building 3D Tiles)",
    nameJa: "3D都市モデル（Project PLATEAU）",
    provider: "Ministry of Land, Infrastructure, Transport and Tourism (MLIT), Japan",
    kind: "map",
    status: "live",
    usedFor: "“Building info” mode: building usage, year built, height, storeys and hazard attributes.",
    url: "https://www.mlit.go.jp/plateau/",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.en",
    attribution: "出典：国土交通省 Project PLATEAU",
    attributionUrl: "https://www.mlit.go.jp/plateau/",
    endpoints: ["https://assets.cms.plateau.reearth.io/assets/…/tileset.json (per city, from the data catalog)"],
    notes: [
      "PLATEAU building data is multi-licensed (CC BY 4.0 / ODbL / ODC-BY). We use it under CC BY 4.0.",
      "We restyle the buildings (near-invisible, amber highlight on the picked one). That is a modification under CC BY 4.0, which this note discloses.",
      "PLATEAU streaming is a trial service with no SLA. Every request times out after 8 s and fails quietly.",
    ],
    verify: [
      "Confirm the license and attribution wording on https://www.mlit.go.jp/plateau/site-policy/.",
      "Confirm the streaming docs at https://docs.plateauview.mlit.go.jp (the GitHub tutorial is no longer updated).",
    ],
    checked: "2026-10-16",
  },
  {
    id: "plateau-ortho",
    name: "PLATEAU-Ortho aerial imagery",
    nameJa: "PLATEAU-Ortho（オルソ画像）",
    provider: "MLIT Project PLATEAU",
    kind: "imagery",
    status: "fallback",
    usedFor: "Ground imagery in “Data view” (the clean PLATEAU-only building view).",
    url: "https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/ortho/plateau-ortho-streaming.md",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.en",
    attribution: "国土交通省 Project PLATEAU",
    attributionUrl: "https://www.mlit.go.jp/plateau/",
    endpoints: ["https://api.plateauview.mlit.go.jp/tiles/plateau-ortho-2023/{z}/{x}/{y}.png"],
    notes: ["Zoom levels 10–19, covering PLATEAU cities only. Built on GSI tiles with newer aerial photos."],
    verify: ["Check whether a newer year than plateau-ortho-2023 has been published."],
    checked: "2026-10-16",
  },
  {
    id: "plateau-catalog",
    name: "PLATEAU data catalog API",
    nameJa: "PLATEAU データカタログAPI",
    provider: "MLIT Project PLATEAU",
    kind: "map",
    status: "build-time",
    usedFor: "Finding each shop city's building tileset URL (scripts/fetch-plateau-catalog.ts).",
    url: "https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.en",
    attribution: "出典：国土交通省 Project PLATEAU",
    attributionUrl: "https://www.mlit.go.jp/plateau/",
    endpoints: [
      "https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets",
      "https://api.plateauview.mlit.go.jp/datacatalog/graphql",
    ],
    notes: ["The schema may change without notice; the script keeps the last good snapshot if the API is down."],
    checked: "2026-10-16",
  },

  // ── Fallback basemaps ─────────────────────────────────────────────────────
  {
    id: "gsi-seamlessphoto",
    name: "GSI Tiles: seamless aerial photos",
    nameJa: "地理院タイル 全国最新写真（シームレス）",
    provider: "Geospatial Information Authority of Japan (GSI)",
    kind: "imagery",
    status: "fallback",
    usedFor: "Fallback globe imagery when Google 3D tiles are unavailable.",
    url: "https://maps.gsi.go.jp/development/ichiran.html",
    license: "GSI Content Terms of Use (compatible with CC BY 4.0)",
    licenseUrl: "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
    attribution: "国土地理院",
    attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html",
    endpoints: ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
    notes: [
      "No application is needed for live tile use, but the credit is required.",
      "If the map becomes the site's main content, GSI may require an application. That's why GSI is our fallback only.",
    ],
    verify: [
      "Confirm the tile URL and zoom range on the GSI tile list.",
      "Confirm any extra credits GSI lists for low-zoom satellite mosaics.",
    ],
    checked: "2026-10-16",
  },
  {
    id: "gsi-std",
    name: "GSI Tiles: standard map",
    nameJa: "地理院タイル 標準地図",
    provider: "Geospatial Information Authority of Japan (GSI)",
    kind: "imagery",
    status: "fallback",
    usedFor: "Second fallback style (a plain map), selectable when 3D is unavailable.",
    url: "https://maps.gsi.go.jp/development/ichiran.html",
    license: "GSI Content Terms of Use (compatible with CC BY 4.0)",
    licenseUrl: "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
    attribution: "国土地理院",
    attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html",
    endpoints: ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
    checked: "2026-10-16",
  },
  {
    id: "osm-tiles",
    name: "OpenStreetMap standard tiles",
    provider: "OpenStreetMap Foundation",
    kind: "imagery",
    status: "planned",
    usedFor: "Future fallback outside Japan only, at low volume.",
    url: "https://www.openstreetmap.org/",
    license: "ODbL 1.0 (data), tile usage policy",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    attribution: "© OpenStreetMap contributors",
    attributionUrl: "https://www.openstreetmap.org/copyright",
    endpoints: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    notes: ["Must follow https://operations.osmfoundation.org/policies/tiles/ (low volume, valid User-Agent/Referer, visible attribution)."],
    checked: "2026-10-16",
  },

  // ── Shop discovery (leads) ────────────────────────────────────────────────
  {
    id: "overture-places",
    name: "Overture Maps Places",
    provider: "Overture Maps Foundation",
    kind: "poi",
    status: "leads",
    usedFor:
      "Japan-wide soup and noodle-shop catalog and discovery leads (release 2026-09-23.1). Open-data records are not independently verified recommendations.",
    url: "https://docs.overturemaps.org/guides/places/",
    license: "CDLA Permissive 2.0 (seeded records); some Places sources use other licenses, e.g. Apache 2.0",
    licenseUrl: "https://cdla.dev/permissive-2-0/",
    attribution: "© Overture Maps Foundation",
    attributionUrl: "https://docs.overturemaps.org/attribution/",
    notes: [
      "Each Places record lists its own sources[].dataset and license. The discovery script keeps both.",
      "Shops seeded from Overture carry dataSource \"overture\" and the Overture ID in sourceId.",
      "Addresses, postcodes, phone numbers, websites and social links shown on shop cards are copied from the source record (aggregator and review-site links are dropped). They may be out of date.",
      "Derived during import, with provenance shown in the interface: prefecture (from the record's region, address or postcode prefix, else its nearest neighbours), bowl style (only when the shop's own name says it, e.g. 味噌 or 家系), chain (the same brand at 6+ locations in 3+ municipalities) and English names (chain brand names we know, otherwise an approximate reading).",
      "Records with an Overture confidence below 0.3 are left out as likely closed or duplicated.",
    ],
    verify: ["Confirm the exact license for the Overture release you pull, on the attribution page."],
    checked: "2026-10-16",
  },
  {
    id: "osm-overpass",
    name: "OpenStreetMap data via Overpass API",
    provider: "OpenStreetMap contributors",
    kind: "poi",
    status: "leads",
    usedFor: "Secondary lead source for the review queue. The expanded published catalog uses Overture, not OSM.",
    url: "https://wiki.openstreetmap.org/wiki/Overpass_API",
    license: "ODbL 1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    attribution: "© OpenStreetMap contributors",
    attributionUrl: "https://www.openstreetmap.org/copyright",
    endpoints: ["https://overpass-api.de/api/interpreter"],
    notes: [
      "ODbL is share-alike. If a shop record is copied substantially from OSM, it gets dataSource \"osm\", and our shop dataset becomes a derivative database under ODbL.",
      "Our editorial content (blurbs, videos, photos) stays ours either way.",
    ],
    checked: "2026-10-16",
  },
  {
    id: "wikipedia-ramen",
    name: "Wikipedia: Ramen and regional styles",
    provider: "Wikipedia contributors",
    kind: "reference",
    status: "build-time",
    usedFor: "Factual background for our broth-style descriptions, paraphrased in our own words.",
    url: "https://en.wikipedia.org/wiki/Ramen",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Wikipedia contributors, “Ramen”",
    attributionUrl: "https://en.wikipedia.org/wiki/Ramen",
    checked: "2026-10-16",
  },
  {
    id: "journal-further-reading",
    name: "Soupmap Journal: further reading",
    provider: "Wikipedia contributors",
    kind: "reference",
    status: "live",
    usedFor: "Each journal article links to English Wikipedia articles for further reading. The articles themselves are original writing; no Wikipedia text or images are copied.",
    url: "https://en.wikipedia.org/",
    license: "Links only (Wikipedia text is CC BY-SA 4.0)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    attribution: "Wikipedia contributors",
    attributionUrl: "https://en.wikipedia.org/",
    notes: ["Links use Wikipedia's search with go=Go, which opens the article when the title exists and shows search results otherwise, so a renamed article never becomes a dead link."],
    checked: "2026-10-19",
  },

  {
    id: "recipe-photos",
    name: "Recipe photographs (Wikimedia Commons)",
    provider: "Individual photographers on Wikimedia Commons",
    kind: "imagery",
    status: "planned",
    usedFor: "One photograph per recipe on /recipes/, chosen by hand. Each photo's author, licence and file page are credited on the recipe itself.",
    url: "https://commons.wikimedia.org/",
    license: "Per photo: CC0, public domain, CC BY or CC BY-SA (never NC or ND)",
    licenseUrl: "https://commons.wikimedia.org/wiki/Commons:Licensing",
    attribution: "Photographers credited on each recipe, via Wikimedia Commons",
    attributionUrl: "https://commons.wikimedia.org/",
    notes: [
      "scripts/fetch-recipe-photos.ts reads the licence from the Commons API, refuses anything that isn't CC0, public domain, CC BY or CC BY-SA, and records author, licence and file page in src/data/recipe-photos.json.",
      "Photos are resized copies hosted with the site; CC BY-SA photos stay under CC BY-SA.",
      "Until a recipe has a verified photo it shows a typographic panel, never a stock or generated image.",
    ],
    verify: ["Spot-check each photo's file page: the licence still allows reuse and the credit matches."],
    checked: "2026-10-20",
  },

  // ── Libraries ─────────────────────────────────────────────────────────────
  {
    id: "cesiumjs",
    name: "CesiumJS 1.146",
    provider: "Cesium GS, Inc.",
    kind: "library",
    status: "live",
    usedFor: "3D globe, 3D Tiles streaming, Street View panoramas.",
    url: "https://cesium.com/platform/cesiumjs/",
    license: "Apache License 2.0",
    licenseUrl: "https://github.com/CesiumGS/cesium/blob/main/LICENSE.md",
    attribution: "CesiumJS",
    attributionUrl: "https://cesium.com/",
    notes: ["Cesium ion is not used."],
    checked: "2026-10-16",
  },
  {
    id: "spark",
    name: "Spark",
    provider: "World Labs",
    kind: "library",
    status: "live",
    usedFor: "Gaussian-splat “Step inside” viewer (loaded on demand).",
    url: "https://sparkjs.dev/",
    license: "MIT",
    licenseUrl: "https://github.com/sparkjsdev/spark/blob/main/LICENSE",
    attribution: "Spark by World Labs",
    attributionUrl: "https://github.com/sparkjsdev/spark",
    checked: "2026-10-16",
  },
  {
    id: "threejs",
    name: "three.js",
    provider: "three.js authors",
    kind: "library",
    status: "live",
    usedFor: "Rendering for the splat viewer.",
    url: "https://threejs.org/",
    license: "MIT",
    licenseUrl: "https://github.com/mrdoob/three.js/blob/dev/LICENSE",
    attribution: "three.js",
    attributionUrl: "https://threejs.org/",
    checked: "2026-10-16",
  },
  {
    id: "supercluster",
    name: "Supercluster",
    provider: "Mapbox",
    kind: "library",
    status: "live",
    usedFor: "Clustering shop pins at country and region zoom.",
    url: "https://github.com/mapbox/supercluster",
    license: "ISC",
    licenseUrl: "https://github.com/mapbox/supercluster/blob/main/LICENSE",
    attribution: "Supercluster",
    attributionUrl: "https://github.com/mapbox/supercluster",
    checked: "2026-10-16",
  },
  {
    id: "zod",
    name: "Zod",
    provider: "Colin McDonnell and contributors",
    kind: "library",
    status: "build-time",
    usedFor: "Validating shops.json at build time.",
    url: "https://zod.dev/",
    license: "MIT",
    licenseUrl: "https://github.com/colinhacks/zod/blob/main/LICENSE",
    attribution: "Zod",
    attributionUrl: "https://zod.dev/",
    checked: "2026-10-16",
  },

  // ── Fonts (Google Fonts, self-hosted via Fontsource) ──────────────────────
  {
    id: "font-fraunces",
    name: "Fraunces",
    provider: "Undercase Type (Google Fonts)",
    kind: "font",
    status: "live",
    usedFor: "Wordmark and headings.",
    url: "https://fonts.google.com/specimen/Fraunces",
    license: "SIL Open Font License 1.1",
    licenseUrl: "https://openfontlicense.org/",
    attribution: "Fraunces by Undercase Type",
    attributionUrl: "https://github.com/undercasetype/Fraunces",
    checked: "2026-10-16",
  },
  {
    id: "font-instrument-sans",
    name: "Instrument Sans",
    provider: "Instrument (Google Fonts)",
    kind: "font",
    status: "live",
    usedFor: "Body text.",
    url: "https://fonts.google.com/specimen/Instrument+Sans",
    license: "SIL Open Font License 1.1",
    licenseUrl: "https://openfontlicense.org/",
    attribution: "Instrument Sans by Instrument",
    attributionUrl: "https://github.com/Instrument/instrument-sans",
    checked: "2026-10-16",
  },
  {
    id: "font-noto-sans-jp",
    name: "Noto Sans JP",
    provider: "Google (Google Fonts)",
    kind: "font",
    status: "live",
    usedFor: "Japanese text.",
    url: "https://fonts.google.com/noto/specimen/Noto+Sans+JP",
    license: "SIL Open Font License 1.1",
    licenseUrl: "https://openfontlicense.org/",
    attribution: "Noto Sans JP by Google",
    attributionUrl: "https://github.com/notofonts/noto-cjk",
    checked: "2026-10-16",
  },

  // ── Services ──────────────────────────────────────────────────────────────
  {
    id: "cloudflare-web-analytics",
    name: "Cloudflare Web Analytics",
    provider: "Cloudflare, Inc.",
    kind: "service",
    status: "live",
    usedFor: "Privacy-first page analytics (no cookies). Included only when a token is configured.",
    url: "https://www.cloudflare.com/web-analytics/",
    license: "Cloudflare Website and Online Services Terms",
    licenseUrl: "https://www.cloudflare.com/website-terms/",
    attribution: "Cloudflare Web Analytics",
    attributionUrl: "https://www.cloudflare.com/web-analytics/",
    checked: "2026-10-16",
  },
] as const satisfies readonly Source[];

export type SourceId = (typeof SOURCES)[number]["id"];

const byId = new Map<string, Source>(SOURCES.map((s) => [s.id, s]));

export function getSource(id: SourceId): Source {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown source: ${id}`);
  return found;
}

/** HTML for a Cesium Credit: exact attribution text, linked. */
export function creditHtml(id: SourceId): string {
  const s = getSource(id);
  return `<a href="${s.attributionUrl}" target="_blank" rel="noopener">${s.attribution}</a>`;
}

export const KIND_LABELS: Record<SourceKind, string> = {
  map: "3D map & building data",
  imagery: "Imagery & basemaps",
  poi: "Shop discovery data",
  reference: "Reference",
  library: "Open-source libraries",
  font: "Fonts",
  service: "Services",
};

export const STATUS_LABELS: Record<SourceStatus, string> = {
  live: "Live",
  fallback: "Fallback",
  "build-time": "Build time",
  leads: "Leads only",
  planned: "Planned",
};
