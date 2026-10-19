# Soupmap

A field guide to Japan, one bowl at a time. Explore a Tokyo-first 3D map, discover soup
shops across seven cities, and build a personal collection of places worth a detour.

The Atlas interface pairs warm paper, vermilion, editorial typography, and original vector
bowl illustrations with a dedicated map viewport. Shop details replace the desktop sidebar;
mobile uses a draggable sheet. Illustrations are not restaurant photos.

- City, broth, and English/Japanese search filters work together and update map pins.
- Save places in this browser, revisit them in **Saved**, and synchronize across tabs.
- Sort by guide order, name, or city; **Find me a bowl** chooses within the current results.
- Zoom, face north, switch between overhead and tilted views, or return to all Japan.
- Press `/` to search, Enter to open the first current result, and Escape to dismiss.
- With no Google key, supported selected areas load PLATEAU buildings automatically. The
  committed catalog contains 11 municipality/ward tilesets; Tokyo's three manifests were
  checked successfully. Coverage follows the selected ward, not every building in Japan.
- Google photorealistic tiles and Street View still require a valid configured Google key.

**Phase 1 status:** a static site (Vite + TypeScript + CesiumJS) for Cloudflare Pages with 15
seeded shops. Every shop is `"verified": false` until someone checks it by hand (see
[CHECKLIST.md](CHECKLIST.md)).

---

## Contents

1. [Local development](#1-local-development)
2. [Google setup](#2-google-setup-map-tiles--street-view)
3. [Deploy to Cloudflare Pages](#3-deploy-to-cloudflare-pages)
4. [Data scripts](#4-data-scripts)
5. [Licensing summary](#5-licensing-summary)
6. [Splat capture pipeline](#6-splat-capture-pipeline-step-inside)
7. [How the app is built](#7-how-the-app-is-built)
8. [What's tested, and known limits](#8-whats-tested-and-known-limits)

---

## 1. Local development

You need **Node.js 20.19+** (22 LTS recommended) and npm.

```bash
npm install
cp .env.example .env.local      # then fill in VITE_GOOGLE_MAPS_KEY (optional)
npm run dev                     # http://localhost:5173
```

Without a Google key the app uses GSI imagery and automatically loads PLATEAU buildings
where the catalog supports the current city or selected shop. The status chip reports whether
buildings have actually loaded. Map and aerial imagery switches remain usable in that view.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload. |
| `npm run build` | Refreshes the PLATEAU snapshot (soft), validates `shops.json`, typechecks, builds to `dist/`. |
| `npm run preview` | Serves `dist/` locally, the closest thing to production. |
| `npm run validate` | Zod validation of `src/data/shops.json`; lists unverified shops. |
| `npm run typecheck` | TypeScript only. |
| `npm test` | Discovery rules and DOM integration regression tests (no WebGL). |
| `npm run data:plateau` | Fetch the PLATEAU catalog → `src/data/plateau-tilesets.json` ([§4](#41-fetch-plateau-catalog)). |
| `npm run discover` | Open-data shop leads → `data/candidates/` ([§4](#42-discover-shops)). |
| `npm run licenses` | Prints the licensing table below from `src/sources.ts`. |

**Debug switches** (append to the URL):

- `?debug`: exposes the map engine as `window.soupmap` in the console.
- `?debug=plateau`: logs the real property names of any PLATEAU building you click, plus
  load failures. Use it to check the attribute mapping in `src/map/plateau-attributes.ts`
  against live data.

### Environment variables

All are read at **build time** (Vite inlines `VITE_*` values), so change them, then rebuild.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_GOOGLE_MAPS_KEY` | No | Google Maps Platform key (Map Tiles API + Street View Static API). Empty = GSI fallback. |
| `VITE_CF_ANALYTICS_TOKEN` | No | Cloudflare Web Analytics site token. Empty = no analytics script at all. |
| `VITE_SITE_URL` | No | Public origin for canonical/OG tags, sitemap, and `/llms.txt`. Defaults to `https://soupmap.com`. |

---

## 2. Google setup (Map Tiles + Street View)

The key ships inside the JavaScript bundle. Every browser map key does, so **the restrictions
are what protect it**. Don't skip step 5.

1. **Create a project** at <https://console.cloud.google.com/> (e.g. "soupmap").
2. **Turn on billing** for the project (Billing → Link a billing account). Map Tiles won't serve
   without it, even inside the free tier.
3. **Enable the two APIs** (APIs & Services → Library):
   - **Map Tiles API** (Photorealistic 3D Tiles)
   - **Street View Static API** ("Stand outside" panoramas)
4. **Create a key**: APIs & Services → Credentials → Create credentials → API key.
5. **Restrict the key** (click the key → Edit):
   - *API restrictions* → "Restrict key" → select **Map Tiles API** and **Street View Static API** only.
   - *Application restrictions* → **Websites** (HTTP referrers), add:
     ```
     soupmap.com/*
     www.soupmap.com/*
     *.pages.dev/*
     localhost:*
     ```
     Tip: `*.pages.dev/*` covers preview deployments. Tighten it to
     `*.<your-project>.pages.dev/*` once you know your Pages project name.
6. **Set a budget alert**: Billing → Budgets & alerts → Create budget (for example $50/month,
   with alerts at 50 %, 90 % and 100 %). Alerts notify you; they don't cap spending. If you want
   a hard stop, also set per-API quotas (APIs & Services → each API → Quotas).
7. Put the key in `.env.local` (local) and in Cloudflare Pages ([§3](#3-deploy-to-cloudflare-pages)).

**What costs what.** Check current pricing at <https://mapsplatform.google.com/pricing/>.

- 3D tiles are billed by Map Tiles API usage as people move around the map.
- "Stand outside" checks availability with the Street View **metadata** endpoint, which Google
  doesn't bill. Opening a panorama loads **six** Street View Static images (one per cube face).

**Attribution.** CesiumJS draws Google's logo and data credits automatically. Never hide or
restyle them. The panels are laid out to stay above Cesium's credit bar. The Google logo image is
served by Cesium from `assets.ion.cesium.com`. That's a plain image download: no Cesium ion
account, token or API is involved, and the app never calls ion.

**Referrer policy.** `public/_headers` sets `Referrer-Policy: strict-origin-when-cross-origin`,
which sends your origin to Google so the referrer restriction can match. Don't change it to
`no-referrer`.

---

## 3. Deploy to Cloudflare Pages

The site is fully static: everything ends up in `dist/`.

### 3.1 Git integration (recommended)

1. Cloudflare dashboard → **Workers & Pages** → Create → **Pages** → Connect to Git →
   pick `whatalexthinks/soupmap`.
2. Build settings:
   - Framework preset: **None** (or Vite)
   - Build command: **`npm run build`**
   - Build output directory: **`dist`**
   - Root directory: *(leave empty)*
3. **Environment variables** (Settings → Variables and Secrets). Add them for **both
   Production and Preview**:
   - `NODE_VERSION` = `22`
   - `VITE_GOOGLE_MAPS_KEY` = your key
   - `VITE_CF_ANALYTICS_TOKEN` = your token (optional, see below)
   - `VITE_SITE_URL` = `https://soupmap.com`
4. Save and deploy. Every push to the production branch redeploys. Other branches get preview
   URLs on `*.pages.dev`.

The build runs `scripts/fetch-plateau-catalog.ts --soft`, so each deploy refreshes the PLATEAU
building index. If the PLATEAU API is down, the build keeps the committed snapshot and carries on.

### 3.2 Direct upload (no Git)

```bash
npm run build
npx wrangler pages deploy dist --project-name soupmap
```

(`wrangler` asks you to log in the first time. Env vars still come from your local `.env.local`
because Vite inlines them at build time.)

### 3.3 Custom domain + www redirect

1. Pages project → **Custom domains** → *Set up a custom domain* → `soupmap.com`. If the domain's
   DNS is on Cloudflare, the records are created for you. Repeat for `www.soupmap.com`.
2. Redirect www to the apex: the zone **soupmap.com** → **Rules** → **Redirect Rules** →
   *Create rule* → template **"Redirect from WWW to root"** (301, preserve path and query).
   Pages' `_redirects` file can't match on hostname, which is why this lives in a zone rule.
3. Check that `https://www.soupmap.com/credits/` lands on `https://soupmap.com/credits/`.

### 3.4 Analytics

Cloudflare dashboard → **Web Analytics** → *Add a site* → `soupmap.com` → copy the `token`
value from the JS snippet into `VITE_CF_ANALYTICS_TOKEN`, then redeploy. The build injects the
beacon only when the token is set. (Don't also enable automatic injection on the Pages project,
or you'll count every visit twice.)

### 3.5 Caching and headers

`public/_headers` caches `/assets/*` (content-hashed) and `/cesium/<version>/*` forever. Cesium's
runtime files are copied into a **versioned** folder (`/cesium/1.146.0/`), so upgrading Cesium
changes the path and old caches can't serve stale workers.
The current Replit production command serves real files from `dist/` using sirv, without an
SPA fallback. Shop, city and catalog URLs have generated directory `index.html` documents;
missing shop URLs must return 404 rather than the homepage. If moving to Cloudflare Pages,
configure a real 404 response instead of relying on its implicit SPA fallback.

### 3.6 AI search and crawler access

The current `.replit` production target is **Replit Autoscale**. The following review applies
only if using the Cloudflare Pages hosting described above or proxying the site through
Cloudflare. Adding Cloudflare Web Analytics alone does not put these edge controls in front
of the site.

- Review the Cloudflare zone's **AI crawler/bot controls**, WAF rules, and challenges. Allow
  the search/indexing and user-initiated retrieval agents intended to read and cite the public
  atlas; do not blanket-allow all automation or disable general abuse protections.
- Decide **training permissions separately** from search/retrieval access. Check each
  provider's current agent documentation rather than assuming all of its agents have the
  same purpose. Record chosen agents, allowed purposes, intentional exclusions, reasons, and
  review date in the release notes or deployment policy record. No intentional exclusions
  are established here; the deployment owner must record the decision.
- Verify the chosen agents can retrieve the homepage, `/credits/`, `/llms.txt`, and
  `/data/open-shops.json.gz` without an edge denial or JavaScript challenge. Use provider
  verification tools and edge logs where available; a successful browser request or a
  spoofed user-agent alone does not prove access by the actual crawler.

The generated `robots.txt` permits all user agents, but cannot override an edge block or
challenge. This is a **potential configuration risk, not a confirmed live block**: no
Cloudflare dashboard state or production responses were inspected for this source-only
change.

The build also emits `/llms.txt` with canonical resource links and Japan pilot data
limitations. This emerging convention is optional, not an indexing requirement or a grant
of crawling/training permission. It links to the crawlable `/catalog/` directory and sitemap;
interactive map fragments are not published documents.

### 3.7 Static catalog pages

The build emits `/catalog/` with numbered pagination for all nationwide records, equivalent
directories for the seven featured cities at `/city/<slug>/`, and `/shop/<slug>/` documents
only for substantive records. Basic imported locations remain visible in directory HTML
with names, reported coordinates, source IDs, licenses and unverified notices, but do not
receive thin standalone pages. Shop pages retain original names, editorial notes, known
facts and explicit unknowns. All generated documents include unique metadata, canonical
URLs and structured data, and are listed in the sitemap. They work without JavaScript.

Eligibility lives in `src/data/indexation.ts`; page content in `src/render/catalog.ts` reuses
the existing data and credits document layout. Keep page generation, shop/share links and
sitemap inclusion aligned when changing the policy.

### 3.8 The Soupmap Journal (`/journal/`)

64 original essays in seven topics (ramen styles, noodles, Japanese soups, craft and
ingredients, history, travel etiquette, soups of the world), prerendered as static pages in a
Japanese-minimalist design: washi background, sumi type, one vermilion accent, a vertical
mark per article. It works without JavaScript and is the site's main organic-search surface.

- **Write or edit** Markdown in `content/journal/<slug>.md`. The format, voice and fact rules
  are in [content/journal/README.md](content/journal/README.md): personal voice, no invented
  experiences, legends hedged, no prices or opening hours.
- **The build validates everything**: unknown fields, bad categories, broken internal links
  and unsafe URLs fail `npm run build` with the file and the reason.
- **Output**: `/journal/`, `/journal/topic/<id>/`, `/journal/<slug>/` and
  `/journal/feed.xml` (RSS), with canonical URLs, `BlogPosting` and breadcrumb structured
  data, and sitemap and `llms.txt` entries.
- **Into the map**: an article's `map:` field becomes a "Find it on the map" button
  (`/map/?q=iekei` opens the map with that nationwide search).
- Code: `src/journal/` (parser, Markdown subset), `src/render/journal.ts` (pages),
  `src/styles/journal.css`, `journal/index.html` (the Vite entry for the stylesheet).

### 3.9 Your Soupmap dashboard (`/me/`)

A personal page that gives visitors a reason to come back: plan a trip, keep places, and
collect bowls. It works fully without an account (everything stays in the browser) and gets
better when signed in, using the existing `/api` lists endpoints. No server changes.

- **Plan a trip**: choose a city or prefecture, days (1–7), bowls a day (1–4) and optional
  cravings (tsukemen, niboshi, udon…). Saved places and editor's picks come first; each day
  starts somewhere new and is filled with places within a walk (3 km, else 8 km), in a
  nearest-neighbour order. Every stop says why it was chosen ("Editor's pick", "Tsukemen,
  from the name", "Independent"). It never claims quality, hours or menus. Plans are
  deterministic per seed, so **Shuffle** rolls a new one, and they open on the map as
  `/map/?collection=…`. Code: `src/me/planner.ts`.
- **Saved trips** (device), **saved places** (account when signed in, otherwise this browser)
  with **Mark visited**, and **account lists**. Signed in, a saved trip also becomes an
  account list (`POST /api/lists`, then `PUT /api/lists/:id/items`).
- **Passport**: nine broth stamps and 17 regional bowls (Sapporo miso, Kitakata, Iekei,
  Toyama Black, Hakata…), each linked to its journal essay and a map search
  (`src/me/regional.ts`). `/map/?open=passport` opens the full passport dialog.
- **For you**: bowl of the day, interesting places near your saves, broth styles you haven't
  had yet, and journal articles to read next. All of it is computed in the browser from your
  own saves and visits (`src/me/recommend.ts`).
- **Your data**: download everything stored in the browser as JSON.
- **Accounts**: `GET /api/me` decides the state: 200 means signed in, 401 means guest (shows
  "Create an account"), anything else means accounts are unavailable (no banner, everything
  local). Device saves are never merged silently; signed-in visitors get an explicit,
  additive **Import** (`POST /api/import-saves`).
- Entry points: home nav ("Plan a trip"), the map masthead ("Plan"), the map panel footer
  ("Your Soupmap"). Storage keys: `soupmap:trips:v1`, `soupmap:planner:v1`, plus the
  existing `soupmap:saved:v1` and `soupmap:passport:v1`.
- Code: `me/index.html`, `src/me/` (`main.ts`, `view.ts`, `store.ts`, `planner.ts`,
  `recommend.ts`, `regional.ts`), `src/styles/me.css`. The journal index reaches the
  browser through the `virtual:soupmap-journal` module in `vite.config.ts`. Tests:
  `tests/me.test.ts`.

---

## 4. Data scripts

### 4.1 Fetch PLATEAU catalog

```bash
npm run data:plateau            # strict: fails if the catalog can't be fetched
npm run data:plateau -- --soft  # what `npm run build` uses: keeps the last snapshot on failure
```

It downloads the PLATEAU data catalog (about 2 MB) and writes `src/data/plateau-tilesets.json`
with **one building tileset per municipality/ward code that has a shop**: LOD2 over LOD1, untextured
over textured (we restyle buildings, so textures would be wasted bandwidth), newest data first.

- Shops use **5-digit municipality codes**. Inside designated cities that's the **ward** code
  (e.g. Sapporo Chūō-ku `01101`, Chiyoda-ku `13101`), because PLATEAU splits those cities by ward.
- Run it locally after adding a shop in a new ward, and **commit the JSON**, so builds without
  network access still have the data.
- `PLATEAU_CATALOG_URL` overrides the endpoint (for a mirror or a test fixture).
- PLATEAU's streaming docs moved to <https://docs.plateauview.mlit.go.jp>. The GitHub tutorial
  is no longer updated.

### 4.2 Discover shops

`scripts/discover-shops.ts` turns open data into **review leads** in `data/candidates/<city>.json`.
It never writes to `src/data/shops.json`.

**Prerequisites** (Overture), one of:

- **DuckDB CLI** (fastest: it filters inside Overture's GeoParquet in the cloud):
  `brew install duckdb` (macOS) or download from <https://duckdb.org/docs/installation/>.
- **overturemaps CLI**: `pipx install overturemaps` (downloads every place in the city box,
  then filters locally).

```bash
npm run discover                                    # all cities, Overture + OSM
npm run discover -- --city tokyo,fukuoka            # chosen cities (slugs in src/data/cities.ts)
npm run discover -- --source overture               # overture | osm | all
npm run discover -- --engine cli                    # force the overturemaps CLI
npm run discover -- --release 2026-09-23.1          # pin an Overture release (default: latest)
npm run discover -- --list-categories --city tokyo  # inspect the Places taxonomy first
npm run discover -- --city tokyo --overture-file tokyo.geojsonseq   # use a download you already have
```

What it matches:

- **Overture Places**: the `taxonomy` categories `ramen_restaurant`, `noodles_*`, `udon`, `soba`,
  `oden`, `soup_restaurant` (any category containing ramen/noodle/udon/soba/oden/soup), **plus**
  restaurants whose Japanese name contains ラーメン, うどん, そば, おでん, 麺 and similar. Many ramen
  shops are only tagged `japanese_restaurant`. Overture schema 2.0.0 (Sept 2026) removed the old
  `categories` field. The script reads `taxonomy`, and `categories` only for older releases.
  Run `--list-categories` whenever you switch releases: the taxonomy evolves.
- **OpenStreetMap** via Overpass: `amenity=restaurant|fast_food` with
  `cuisine~ramen|noodle|udon|soba`, or a soup-shop word in `name` / `name:ja`. One request per
  city, 2 s apart, with an identifying User-Agent. Set `OVERPASS_URL` to use another instance.

Each candidate has `source`, `sourceId`, `name`, `name:ja`, `lat`, `lng`, `website`,
`opening_hours`, `category`, `matchedBy` (category or name), `license` and `alreadyListed` (a shop
we already list within 75 m). New category matches sort first.

> Corporate proxy? Node's built-in `fetch` ignores `HTTPS_PROXY` unless you run with
> `NODE_USE_ENV_PROXY=1` (Node 22.21+).

### 4.3 Promote a candidate into shops.json

1. Open `data/candidates/<city>.json` and pick a lead.
2. **Verify it yourself.** Check the shop's official site or social account for the name and
   address, and confirm it's open. A visit is best.
3. **Place the pin on the street frontage**, outside the entrance, not the middle of the roof.
   Use the shop's address with the GSI map (<https://maps.gsi.go.jp/>) or Soupmap's own 3D view.
   Don't copy coordinates or details out of Google Maps or Tabelog.
4. Add an entry to `src/data/shops.json` (copy an existing one):
   - `slug`: lowercase-kebab-case, unique, stable (it's the deep link: `/#slug`).
   - `cityCode`: 5-digit municipality code; ward code inside designated cities.
   - `broth`: one of `shio`, `shoyu`, `miso`, `tonkotsu`, `chicken-paitan`, `tsukemen`, `udon`,
     `soba`, `oden`, `other`.
   - `blurb`: one or two sentences **written by us**. Never paste from guides or reviews.
   - `priceYen` / `hours`: `null` unless you're confident. The card then says "Check before you go".
   - `photo`: only with a visible `credit` and a `license` (the schema enforces it).
   - `dataSource` + `sourceId`:
     - `"manual"` if you placed and wrote it yourself;
     - `"overture"` + the Overture ID if you took its location from Overture;
     - `"osm"` + `node/123` if copied substantially from OpenStreetMap. That makes our shop
       dataset a **derivative database under ODbL**. The credits page then says so automatically.
   - `verified`: `true` only after step 2 and 3.
5. `npm run validate`, then `npm run data:plateau` if it's a new ward, then commit.
6. If you add a new city, add it to `src/data/cities.ts` first (centre, rough ground height, bbox).

---

### 4.4 Refresh the open-data catalog (Overture)

```bash
pip install pyarrow==25.0.1          # or: uv sync (pyproject.toml)
python3 scripts/fetch-open-places.py --release 2026-09-23.1 --output /tmp/soupmap-overture.json
node --import tsx scripts/import-open-places.ts --input /tmp/soupmap-overture.json
npm run validate && npm test
```

The fetch reads only the Parquet row groups that overlap Japan, straight from Overture's public
S3 bucket (about 2–3 minutes). The importer writes three files together, never edit them by hand:
`public/data/open-shops.json.gz` (the full, downloadable dataset), `open-shops-core.json.gz`
(what browsers load: names, location, style, chain) and `details/<xx>.json.gz` (contact
details, fetched per shop when its card opens). It keeps addresses, phones, websites and social
links from the source (never review-site links), drops records with confidence below 0.3,
derives prefectures from postcodes, infers styles only from the shop's own name, marks chains
(6+ locations in 3+ municipalities) and writes English names (`scripts/lib/brands.ts`,
`scripts/lib/romanize.ts`). `npm run data:romanize` re-runs only the English names.

## 5. Licensing summary

Generated from `src/sources.ts` (`npm run licenses`). The same registry builds the
[/credits](https://soupmap.com/credits/) page and the in-map attribution.

| Source | Used for | Status | License | Attribution |
|---|---|---|---|---|
| [Google Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles) | Primary photorealistic 3D city layer. | Live | [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms) | Google (logo and data providers shown in the map) |
| [Google Street View Static API](https://developers.google.com/maps/documentation/streetview/overview) | “Stand outside” panoramas at each shop, rendered as a CesiumJS cube-map panorama. | Live | [Google Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms) | Google |
| [Project PLATEAU 3D city models (building 3D Tiles)](https://www.mlit.go.jp/plateau/) | “Building info” mode: building usage, year built, height, storeys and hazard attributes. | Live | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en) | 出典：国土交通省 Project PLATEAU |
| [PLATEAU-Ortho aerial imagery](https://github.com/Project-PLATEAU/plateau-streaming-tutorial/blob/main/ortho/plateau-ortho-streaming.md) | Ground imagery in “Data view” (the clean PLATEAU-only building view). | Fallback | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en) | 国土交通省 Project PLATEAU |
| [PLATEAU data catalog API](https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets) | Finding each shop city's building tileset URL (scripts/fetch-plateau-catalog.ts). | Build time | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en) | 出典：国土交通省 Project PLATEAU |
| [GSI Tiles: seamless aerial photos](https://maps.gsi.go.jp/development/ichiran.html) | Fallback globe imagery when Google 3D tiles are unavailable. | Fallback | [GSI Content Terms of Use (compatible with CC BY 4.0)](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html) | 国土地理院 |
| [GSI Tiles: standard map](https://maps.gsi.go.jp/development/ichiran.html) | Second fallback style (a plain map), selectable when 3D is unavailable. | Fallback | [GSI Content Terms of Use (compatible with CC BY 4.0)](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html) | 国土地理院 |
| [OpenStreetMap standard tiles](https://www.openstreetmap.org/) | Future fallback outside Japan only, at low volume. | Planned | [ODbL 1.0 (data), tile usage policy](https://www.openstreetmap.org/copyright) | © OpenStreetMap contributors |
| [Overture Maps Places](https://docs.overturemaps.org/guides/places/) | Lead generation (scripts/discover-shops.ts) and the starting coordinates of the seeded shops (release 2026-09-23.1, records sourced from Meta and Overture). | Leads only | [CDLA Permissive 2.0 (seeded records); some Places sources use other licenses, e.g. Apache 2.0](https://cdla.dev/permissive-2-0/) | © Overture Maps Foundation |
| [OpenStreetMap data via Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) | Secondary lead source for the review queue. Nothing from OSM is in shops.json today. | Leads only | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | © OpenStreetMap contributors |
| [Wikipedia: Ramen and regional styles](https://en.wikipedia.org/wiki/Ramen) | Factual background for our broth-style descriptions, paraphrased in our own words. | Build time | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | Wikipedia contributors, “Ramen” |
| [CesiumJS 1.146](https://cesium.com/platform/cesiumjs/) | 3D globe, 3D Tiles streaming, Street View panoramas. | Live | [Apache License 2.0](https://github.com/CesiumGS/cesium/blob/main/LICENSE.md) | CesiumJS |
| [Spark](https://sparkjs.dev/) | Gaussian-splat “Step inside” viewer (loaded on demand). | Live | [MIT](https://github.com/sparkjsdev/spark/blob/main/LICENSE) | Spark by World Labs |
| [three.js](https://threejs.org/) | Rendering for the splat viewer. | Live | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) | three.js |
| [Supercluster](https://github.com/mapbox/supercluster) | Clustering shop pins at country and region zoom. | Live | [ISC](https://github.com/mapbox/supercluster/blob/main/LICENSE) | Supercluster |
| [Zod](https://zod.dev/) | Validating shops.json at build time. | Build time | [MIT](https://github.com/colinhacks/zod/blob/main/LICENSE) | Zod |
| [Fraunces](https://fonts.google.com/specimen/Fraunces) | Wordmark and headings. | Live | [SIL Open Font License 1.1](https://openfontlicense.org/) | Fraunces by Undercase Type |
| [Instrument Sans](https://fonts.google.com/specimen/Instrument+Sans) | Body text. | Live | [SIL Open Font License 1.1](https://openfontlicense.org/) | Instrument Sans by Instrument |
| [Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP) | Japanese text. | Live | [SIL Open Font License 1.1](https://openfontlicense.org/) | Noto Sans JP by Google |
| [Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) | Privacy-first page analytics (no cookies). Included only when a token is configured. | Live | [Cloudflare Website and Online Services Terms](https://www.cloudflare.com/website-terms/) | Cloudflare Web Analytics |

_20 sources across 7 kinds. Generated from src/sources.ts._

### The notes that matter most

- **Google** (3D tiles, Street View): stream only. We never download, cache, proxy or modify
  tiles, and never hide or restyle Google's logo or credits. Users of the map are bound by the
  Google Terms of Service and the Google Maps Additional Terms; the credits page links both.
- **PLATEAU**: the building data is multi-licensed (CC BY 4.0 / ODbL / ODC-BY). We use
  **CC BY 4.0** with the credit **出典：国土交通省 Project PLATEAU**, linked to
  <https://www.mlit.go.jp/plateau/>, shown on screen whenever buildings are. We restyle the
  buildings (near-invisible, vermilion highlight), and the credits page discloses that modification.
  The streaming service is a trial with no SLA, so every call times out after 8 s and fails quietly.
- **GSI** (国土地理院): no application is needed to stream the tiles, but the credit **国土地理院**
  (linked to <https://maps.gsi.go.jp/development/ichiran.html>) is required. **If the map ever
  becomes the main content of the site, GSI may require an application.** That's why GSI is
  only our fallback.
- **OpenStreetMap**: ODbL (share-alike). OSM data is a *lead source only*. Candidate files are
  git-ignored so we never redistribute them by accident. If a shop record is ever copied
  substantially from OSM, mark it `"dataSource": "osm"`. Our shop dataset is then a derivative
  database under ODbL, and the credits page says so automatically. Our editorial content (blurbs,
  videos, photos) stays ours. The future OSM *tile* fallback (outside Japan) must follow the
  [tile usage policy](https://operations.osmfoundation.org/policies/tiles/): low volume, valid
  referer, visible "© OpenStreetMap contributors".
- **Overture**: Places is mostly CDLA Permissive 2.0, but each record lists its own sources and
  licenses (some Foursquare records are Apache 2.0). The 15 seeded shops took their starting
  coordinates from Meta/Overture records under CDLA Permissive 2.0 (release `2026-09-23.1`). Their
  Overture IDs are in `sourceId`.
- **Editorial references**: we may consult well-known guides (e.g. Michelin Bib Gourmand,
  Tabelog's ramen awards) **only to choose names**. We never copy their text, ratings, photos or
  data, and we don't scrape Tabelog or Google Maps. Broth-style background is paraphrased from
  Wikipedia (CC BY-SA), credited on /credits.

---

## 6. Splat capture pipeline ("Step inside")

Phase 1 ships the plumbing: a lazy-loaded full-screen viewer (Spark on three.js) behind the
"Step inside" button, which appears only for shops with a `splatUrl`. The demo shop (AFURI Ebisu)
uses `"splatUrl": "procedural:ramen-bowl"`, a steaming bowl generated from Gaussian splats in
code, because we couldn't confirm the license of any public food or street splat. **Never use a
splat without a confirmed license.**

How we'll make our own:

1. **Permission first.** Get the shop's OK to film inside. Avoid customers' faces, or blur them later.
2. **Capture.** Phone video (4K, 30–60 fps, fixed exposure and focus if your camera app allows),
   walking slowly around and through the space. Keep plenty of overlap and avoid sudden turns.
   For alleys and exteriors, a slow drone orbit works well. 1–3 minutes is plenty.
3. **Frames + camera poses.** `ffmpeg -i clip.mp4 -vf fps=3 frames/%05d.jpg` (aim for 200–600
   sharp frames), then solve camera poses with COLMAP (most trainers can do this step for you).
4. **Train.** [Brush](https://github.com/ArthurBrussee/brush) (open source, runs on Mac/Windows/
   Linux/WebGPU) or nerfstudio's *splatfacto* (built on [gsplat](https://github.com/nerfstudio-project/gsplat)).
5. **Clean.** Open the result in [SuperSplat](https://superspl.at/editor) (PlayCanvas, open source):
   delete floaters, crop to the room, set "up" and scale, keep the file small.
6. **Export `.spz`** (compact, and supported by Spark and CesiumJS). `.ply`, `.splat`, `.ksplat`
   and `.sog` also work in the viewer.
7. **Upload to Cloudflare R2**: create a bucket (e.g. `soupmap-splats`), connect a public custom
   domain (e.g. `splats.soupmap.com`), and add a CORS rule allowing `GET` from
   `https://soupmap.com` and your `*.pages.dev` previews.
8. **Set `splatUrl`** on the shop (e.g. `https://splats.soupmap.com/afuri-ebisu.spz`) and add the
   capture to `src/sources.ts` if anyone other than us made it.

**Phase 2 (in-map splats):** CesiumJS can render `KHR_gaussian_splatting` glTF and 3D Tiles
directly in the globe. That's the path for splats georeferenced onto the real street. See the
TODO in `src/splat/viewer.ts`.

---

## 7. How the app is built

```
index.html             app shell (panel prerendered at build time)
credits/index.html     /credits, rendered at build time from src/sources.ts
src/
  main.ts              fonts + styles + App
  app.ts               UI state, deep links, lazy map loading, feature wiring
  sources.ts           the registry of every external source and license
  i18n.ts              legacy localized strings (Atlas labels currently use English)
  router.ts            /#slug deep links (also understands /shop/<slug>)
  trail.ts             broth-trail player
  data/                shops.json (+ Zod schema), cities, broths, trails, PLATEAU index
  map/                 lazily loaded Cesium code: engine, camera, pins, Street View, PLATEAU
  render/              string templates shared by the build (prerender) and the browser
  splat/viewer.ts      lazily loaded Spark viewer
  ui/                  panel, bottom sheet, card, controls, building panel, splat modal
scripts/               validate-shops, fetch-plateau-catalog, discover-shops, print-licenses
public/                icons, OG image, _headers, web manifest
```

**Map markers.** Thousands of shops share the map, so a shop is a 16 px bead in its style
colour, editor's picks a small vermilion bowl badge, saved shops a vermilion ring, and only the
selected shop a full pin (`src/map/glyph.ts`). Clusters are count pills sized by magnitude.
Names label only at street level; on desktop, hovering names a marker. All marker images come
from a small fixed palette with stable IDs, so Cesium's texture atlas stays bounded.

**Performance.** The page shell (list, search, filters) is about 20 KB of gzipped JavaScript plus
5 KB of render-blocking CSS, and works before the map arrives. Noto Sans JP's 110 KB of
`@font-face` rules load after first paint (Japanese text swaps in from the system font). Cesium
(about 1.1 MB gzipped) is imported only after first paint, behind the steam loader. The splat viewer (three.js + Spark) and the Street View and PLATEAU modules
are separate chunks loaded on demand. Phones get coarser tiles (`maximumScreenSpaceError` 24 vs 16),
no MSAA, and request-render mode (frames are drawn only when something changes).

**North-star hooks** (built so these slot in later without rewrites):

| Later feature | Where it plugs in |
|---|---|
| Our own vertical video per shop | `videoUrl` on the shop; the card already plays it (muted, no autoplay with reduced motion). |
| More broth trails | Add an entry to `src/data/trails.ts`. |
| "Step inside" captures | `splatUrl` (see [§6](#6-splat-capture-pipeline-step-inside)). |
| EN / JA / RU | Add dictionaries in `src/i18n.ts`; every visible string goes through `t()`. |
| Expansion beyond Japan | Add cities (with bbox) in `src/data/cities.ts`; relax `cityCode` in the schema for non-JP shops; enable the planned OSM tile fallback in `sources.ts`. |
| Accounts, check-ins, owner claims, sponsorship, tours | Needs a backend; the client only depends on `shops.json`'s shape, which can move behind an API later. |

---

## 8. What's tested, and known limits

### Current Atlas refresh verification

- `npm test`: 13 passing tests covering real DOM interactions, saved collections, cross-tab
  updates, combined filters, Japanese search, Enter/debounce behavior, sort, random discovery,
  safe template escaping, malformed hash/storage input, and trail cancellation.
- `npm run typecheck`, `npm run build`, and shop data validation pass.
- Tokyo's Chiyoda, Chuo, and Shibuya PLATEAU root manifests returned HTTP 200 with valid roots.
- Browser rendering, mobile visual layout, and live WebGL tile streaming were **not** verified
  for this refresh because browser automation was unavailable. Review on a real browser before
  merging; manifest availability alone does not verify complete geometry rendering.
- The 15 seed shops still have unverified details and no licensed restaurant photographs or
  verified prices/hours. Saves are device-local, not accounts or cloud sync.

### Historical verification (before the Atlas redesign)

These results belong to the earlier interface and are not current scores for this refresh.
The previous implementation documented headless Chromium (software WebGL) checks:

- No key → GSI fallback globe, pins, clusters, fly-to, deep links, filters, search, copy link,
  Escape, 375 px layout with no horizontal scroll, **zero console errors from the app**.
- Street View flow against mocked Google endpoints (availability check, six cube faces, back to
  map, hidden button when there's no panorama).
- Building info against a generated PLATEAU-format tileset (picking through the Google layer,
  plain-English attributes, data view, 8 s timeout path).
- Tonkotsu Trail (order, natural end, stop button, Escape), Step inside (open, Escape, focus).
- Data scripts against real Overture data (release 2026-09-23.1) and mocked PLATEAU/Overpass.
- Lighthouse mobile: Accessibility 100, Best Practices 96, SEO 100 on `/`; 100/100/100 on `/credits/`
  (Performance 95 there). The 4 Best Practices points on `/` are Cesium's own 1× logo image, which
  we don't touch. Performance on `/` scores low in the sandbox because Lighthouse simulates
  Cesium's start-up on a throttled CPU with *software* WebGL; observed first paint was ~0.8 s.
  Measure on a real phone (CHECKLIST §7).

Not verifiable from the build sandbox, so on [CHECKLIST.md](CHECKLIST.md):

- Real Google 3D tiles and Street View imagery with a real key.
- Live PLATEAU tilesets and their exact property names (`?debug=plateau` helps), and the GSI tile
  coverage over the sea at high zoom.
- Safari (iOS/macOS) and Firefox: the code sticks to standard APIs, but test on real devices.
