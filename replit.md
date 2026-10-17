# Running Soupmap on Replit

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

## Open-data catalog

- The downloadable source-attributed catalog is `public/data/open-shops.json.gz`; keep it compressed in Git. Raw extracts belong in `/tmp`, not the repository.
- Refresh explicitly with `python3 scripts/fetch-open-places.py --release 2026-09-23.1 --output /tmp/soupmap-overture.json`, followed by `node --import tsx scripts/import-open-places.ts --input /tmp/soupmap-overture.json`. Python/DuckDB is only for this data-maintenance step; the app still runs on Vite/TypeScript.
- The importer deduplicates locations and allows only explicitly supported CDLA-Permissive-2.0/Apache-2.0 source licenses. Run `npm run validate` and tests after refreshing.
- Keep open-data listings unverified. Do not invent prices, menus, hours, broth styles or municipality codes. Seven featured city shortcuts remain; All Japan/search reaches the nationwide catalog.
- In-app Street View uses Google's imagery APIs; the always-available external Google Maps link is a fallback when API access or imagery coverage is missing.

## Google Street View setup

- Enable **Street View Static API** in the Google Cloud project that owns `VITE_GOOGLE_MAPS_KEY`, with billing active. The current Cesium panorama provider uses this API for both metadata and the six panorama face images.
- **Map Tiles API** is needed for the separate Google photorealistic 3D map. The current implementation does not need Places API or Maps JavaScript API.
- In the key's API restrictions, allow both Street View Static API and Map Tiles API. Keep application restrictions set to websites, with the exact Preview origin followed by `/*`; add the real published/custom origin when publishing. Do not use a wildcard that authorizes every Replit project.
- If requests are denied, check API activation, billing, quota and the actual website referrer in Google Cloud. Keep restrictions in place; do not expose an unrestricted key to troubleshoot.
- The app checks outdoor coverage within 100 m. A missing panorama is not necessarily a key error, and the imagery may not show the precise entrance. Metadata checks do not consume image quota; opening the custom panorama loads six image faces.
- Reference: https://developers.google.com/maps/documentation/streetview/get-api-key and https://developers.google.com/maps/api-security-best-practices
