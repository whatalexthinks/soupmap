# Running Soupmap on Replit

## Product scope and opening

- Soupmap is a worldwide soup atlas, not a Japan-only brand. Current listings are explicitly a **Japan pilot**; do not claim overseas coverage before importing real, attributed records.
- Keep the Soupmap name with the positioning **“Find your next bowl. Anywhere.”**
- The first eligible load per tab shows the planet, pauses, and flies into the explicitly configured Tokyo test destination. The attempt is recorded before WebGL starts; reloads, deep links and unavailable session storage open directly at the destination instead. It does not infer the visitor's location or request geolocation on startup.
- The planet uses bundled Natural Earth II imagery; Google 3D remains the city-scale view and GSI remains the regional Japan fallback. The overview control returns to the whole planet.
- New camera input cancels the intro. Respect reduced motion, and preserve shop deep links rather than forcing every link to Tokyo.
- The logo navigates inside the app rather than reloading the document. Hidden tabs interrupt camera motion. A lost graphics context pauses 3D and leaves shop search available; it does not trigger a reload.
- Google city meshes do not stream at planet scale. Mobile rendering has a bounded base **and overflow** cache, a lower pixel ratio, and no hidden/flight preloading.
- Phone maps query viewport-only clusters with bounded active markers. Large cluster badges use lower-bound counts (such as `100+`) to keep shared GPU textures bounded; search still includes every matching shop. Detail is reduced during gestures and restored once the camera stops; hidden tabs pause the render loop.
- Custom events use Replit's injected published-site tracker through the safe analytics wrapper; do not install another tracker or queue retries that add phone workload. See `docs/analytics-events.md` for the event contract. Custom payloads must exclude raw searches, precise locations, shop/list IDs, bearer links and saved-list contents.

- Keep the imported Vite/TypeScript app in its existing structure.
- Use Node.js 22 (the current dependencies require it).
- The **Start application** workflow runs `npm run dev` on `0.0.0.0:5000`.
- Open Preview to use the app. Run `npm test`, `npm run typecheck`, and `npm run validate` for checks.
- `npm run build` refreshes the PLATEAU catalog in soft mode, validates shop data, typechecks, and writes the production build to `dist/`.
- Post-merge setup runs `scripts/post-merge.sh` to install locked dependencies and typecheck.
- No credentials are required for the GSI map imagery and PLATEAU building mode. Google photorealistic tiles and Street View require the optional `VITE_GOOGLE_MAPS_KEY` with the relevant Google APIs enabled.
- Vite reads optional `VITE_*` settings at startup/build time. Use workspace Secrets rather than committing credentials.

## Publishing

- Autoscale build: `npm ci --no-audit --no-fund && npm run build`.
- Production run: `npm start`, which serves `dist/` on `0.0.0.0` using sirv, with `PORT` or default port 5000, not Vite's development server.
- `VITE_GOOGLE_MAPS_KEY` must be available during the production build. The Google key is intentionally browser-visible; restrict it to the required APIs and exact allowed website origins.
- After publishing, add the actual published origin to the key's website restrictions. Do not assume the development Preview origin covers the published site.

## Shared-link preview

- The homepage includes server-rendered Open Graph and large-image Twitter/X metadata; messaging crawlers do not need JavaScript to read it.
- The 1200×630 image is `public/social/soupmap-world.png`, with vector source beside it. Regenerate it with `npm run assets:social` after editing `scripts/generate-social-card.mjs`. Fonts are converted to paths; no external fonts or Google imagery are needed to display the card.
- Keep metadata image URLs absolute and aligned with the published canonical origin. Changing the image filename helps avoid old image caches. Messaging services may still cache the page preview after publishing; there is no app-side way to clear every service's cache.

## Open-data catalog

- `/catalog/` and its numbered pages expose all reported locations without JavaScript. The seven featured cities have equivalent `/city/<slug>/` directories.
- Standalone `/shop/<slug>/` pages are limited to substantive records with shop-specific editorial notes and menu context. Generic imported location placeholders stay in directories and on the map; do not create thin detail pages just to increase sitemap size.
- Static documents reuse the credits layout, disclose verification status and source attribution, and are emitted as directory `index.html` files. Keep sirv's real-path serving (no homepage fallback for missing shop URLs). Use one eligibility policy for page generation, catalog-document links and share URLs.
- Main-map shop rows must use map fragment destinations, even before JavaScript initializes. Keep crawlable shop documents linked from the separate catalog; SEO must not send ordinary map browsing to a different information page.
- Link the app stylesheet directly from the HTML head. Do not move base styling back into JavaScript imports: slow or failed startup previously exposed unstyled HTML and an oversized loading illustration.

- The downloadable source-attributed catalog is `public/data/open-shops.json.gz`; keep it compressed in Git. Raw extracts belong in `/tmp`, not the repository.
- Browsers load `public/data/open-shops-core.json.gz` (compact rows: names, location, style, chain) at startup and fetch a shop's contact details from `public/data/details/<first two hex digits of its Overture ID>.json.gz` only when its card opens. All three files are written together by the importer; never edit them by hand.
- Refresh explicitly with `python3 scripts/fetch-open-places.py --release 2026-09-23.1 --output /tmp/soupmap-overture.json` (pyarrow; reads only Japan's Parquet row groups from Overture's public S3 bucket), followed by `node --import tsx scripts/import-open-places.ts --input /tmp/soupmap-overture.json`. Python is only for this data-maintenance step; the app still runs on Vite/TypeScript.
- Addresses, postcodes, phones, websites and social links are copied from the source record; review/aggregator sites (Tabelog, Gurunavi, Hot Pepper…) are never stored as a shop website. Records with Overture confidence below 0.3 are dropped.
- Derived fields keep their provenance visible: prefecture (region/address/postcode, else nearest neighbours), bowl style only when the shop's own name says it (e.g. 味噌, 家系; shown as "from the name" / `brothSource: "name"`), chain when one brand has 6+ locations in 3+ municipalities, and English chain names only from the curated list in `scripts/lib/brands.ts`.
- The importer deduplicates locations and allows only explicitly supported CDLA-Permissive-2.0/Apache-2.0 source licenses. Run `npm run validate` and tests after refreshing.
- Keep open-data listings unverified. Do not invent prices, menus, hours, broth styles or municipality codes; a style stated in the shop's own name is evidence, labelled as such, not a verified menu. Seven featured city shortcuts remain; All Japan/search reaches the nationwide catalog.
- The importer generates approximate Latin readings offline using Kuromoji/WanaKana; `npm run data:romanize` can update the existing catalog without downloading a fresh extract. Keep originals, mark generated readings, and leave unreadable proper names in Japanese instead of inventing a translation. Dictionaries never ship to browsers.
- In-app Street View uses Google's imagery APIs; the always-available external Google Maps link is a fallback when API access or imagery coverage is missing.

## Build dependencies

- Cesium runtime assets use the local Vite plugin rather than `vite-plugin-static-copy`, whose latest release pulled in unpatched `braces` (GHSA-vfj7-8cjw-p6xm). Keep the versioned asset paths without reintroducing that dependency chain.

## Google Street View setup

- Enable **Maps JavaScript API** for interactive panoramas and nearby-imagery lookup, in the same Cloud project as `VITE_GOOGLE_MAPS_KEY`, with billing active. Street View Static API is not required.
- **Map Tiles API** is needed for the separate Google photorealistic 3D map. Places API is not used. Street View is an independent native Google viewer with connected-road navigation, not a stationary Cesium cube made of static faces.
- In the key's API restrictions, allow Maps JavaScript API and Map Tiles API. Keep application restrictions set to websites, with the exact Preview origin followed by `/*`; add the real published/custom origin when publishing. Do not use a wildcard that authorizes every Replit project.
- If requests are denied, check API activation, billing, quota and the actual website referrer in Google Cloud. Keep restrictions in place; do not expose an unrestricted key to troubleshoot.
- The app requests official Google outdoor imagery, preferring the best capture within 250 m and widening to 500 m if none exists. Google can misclassify station passages as outdoor; imagery may not show the precise entrance. The JavaScript SDK and coverage lookup load only after explicit entry; the panorama uses Google's Dynamic Street View billing. Zoom starts at zero; navigation depends on connected imagery being available.
- Reference: https://developers.google.com/maps/documentation/javascript/streetview and https://developers.google.com/maps/api-security-best-practices

## Journal (/journal/)

- 64 static essays from `content/journal/*.md`, prerendered by the Vite plugin (`src/render/journal.ts`). The writing, voice and fact rules live in `content/journal/README.md`; the build fails on invalid frontmatter or broken internal links.
- Personal voice, but never invented experiences, people or quotes; legends are hedged; no prices or opening hours. Further reading uses Wikipedia search links.
- Article map buttons use `/map/?q=<words>` (the app opens with that nationwide search). Writers may type the short form `/?q=`; it is normalised.

## Lockfile

- Keep every `resolved` URL in `package-lock.json` on `https://registry.npmjs.org/`. Installing inside Replit can rewrite them to `http://package-firewall.replit.internal/...`, which breaks `npm ci` everywhere else (Cloudflare Pages, CI, fresh clones). A test (`tests/catalog-quality.test.ts`) fails if that happens; fix it with `sed -i 's#http://package-firewall.replit.internal/npm/#https://registry.npmjs.org/#g' package-lock.json`.
