# Launch checklist

Everything here needs a human: an account, a judgement call, a real device, or a source the
build sandbox couldn't reach. Work top to bottom; tick as you go.

## 1. Google Maps Platform

- [ ] Cloud project created, **billing on**.
- [ ] **Map Tiles API** and **Street View Static API** enabled (nothing else).
- [ ] API key restricted to those two APIs.
- [ ] Key restricted to HTTP referrers `soupmap.com/*`, `www.soupmap.com/*`, `*.pages.dev/*`
      (tighten to `*.<project>.pages.dev/*`), `localhost:*`.
- [ ] Monthly **budget alert** set (and per-API quotas if you want a hard ceiling).
- [ ] With the real key: photoreal 3D loads, pins sit on the streets, fly-to lands on a
      three-quarter street view, Google's logo and "Data attribution" are visible and unobstructed.
- [ ] "Stand outside" opens for most shops; for any shop without outdoor imagery the button is
      simply absent (no error).
- [ ] Re-read the [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies)
      and [Street View policies](https://developers.google.com/maps/documentation/streetview/policies)
      (attribution, caching) and confirm nothing changed.

## 2. Cloudflare Pages

- [ ] Project connected to `whatalexthinks/soupmap`; build `npm run build`, output `dist`.
- [ ] Env vars set for **Production and Preview**: `NODE_VERSION=22`, `VITE_GOOGLE_MAPS_KEY`,
      `VITE_SITE_URL=https://soupmap.com`, `VITE_CF_ANALYTICS_TOKEN`.
- [ ] Build log shows `✔ wrote N tileset(s)` from the PLATEAU step (not the "Keeping the existing
      snapshot" warning). If it warns, run `npm run data:plateau` locally and commit the JSON.
- [ ] Custom domain `soupmap.com` + `www.soupmap.com` added; **www → apex** Redirect Rule (301).
- [ ] **Web Analytics**: site added, token in `VITE_CF_ANALYTICS_TOKEN`, redeployed; automatic
      injection left **off** on the Pages project (avoid double counting).
- [ ] `https://soupmap.com/robots.txt`, `/sitemap.xml`, and `/llms.txt` show the right domain;
      the guide links to the homepage, credits, and downloadable catalog.
- [ ] Response headers on the live site include the cache and security headers from `public/_headers`.
- [ ] **If using Cloudflare Pages or a Cloudflare proxy**, review the zone's AI crawler/bot
      controls, WAF rules, and challenges. Allow intended search/indexing and user-initiated
      retrieval agents to read and cite the public atlas; decide training permissions
      separately, without blanket-allowing all automation. Record agents, purposes,
      intentional exclusions (or explicitly none), reasons, and review date in release notes
      or a deployment policy record. See [the access policy review](README.md#36-ai-search-and-crawler-access).
- [ ] For that Cloudflare setup, verify intended agents can fetch `/`, `/credits/`,
      `/llms.txt`, and `/data/open-shops.json.gz` without denials/challenges, using provider
      verification and edge logs where available. `robots.txt` permission and spoofed
      user-agent requests alone do not establish actual crawler access. Mark these two
      Cloudflare policy checks not applicable for direct Replit Autoscale hosting without
      a Cloudflare proxy; Web Analytics alone does not require them. This source-only
      checklist does not assert that a live block exists.

## 3. Verify every shop (then set `"verified": true`)

For each: confirm it's open and the name is right (official site or social account), put the pin
**on the street outside the entrance**, check broth and signature bowl, fill `hours`/`priceYen`
only if you're confident, and re-read the blurb for accuracy. Don't copy coordinates or details
out of Google Maps or Tabelog. All starting coordinates came from Overture 2026-09-23.1.

| ✓ | Shop | City | Coordinates | Check especially |
|---|---|---|---|---|
| [ ] | `afuri-ebisu` AFURI Ebisu | Tokyo | 35.648296, 139.710861 | Several AFURI branches nearby; confirm this is Ebisu (Ebisu 1-chome). |
| [ ] | `rokurinsha-tokyo-station` Rokurinsha | Tokyo | 35.679916, 139.768295 | Overture had two records ~280 m apart (also 35.682404, 139.768768). Confirm the Tokyo Ramen Street location. |
| [ ] | `ginza-kagari` Ginza Kagari Honten | Tokyo | 35.671169, 139.761169 | Several "Kagari" records in Ginza; confirm the honten in the side passage. |
| [ ] | `sumire-susukino` Sumire Susukino | Sapporo | 43.056362, 141.353439 | Branch vs. honten (the honten is in Nakanoshima, outside our list). |
| [ ] | `menya-saimi` Menya Saimi | Sapporo | 43.035511, 141.382187 | Toyohira-ku; `cityCode` 01105. |
| [ ] | `bannai-shokudo` Bannai Shokudo | Kitakata | 37.651199, 139.873383 | "Morning ramen" claim in the blurb; opening hours. |
| [ ] | `honke-daiichi-asahi` Honke Daiichi-Asahi | Kyoto | 34.986710, 135.762543 | Right next to Shinpuku Saikan; make sure the pin is on the right door. |
| [ ] | `kyoto-gogyo` Kyoto Gogyo | Kyoto | 35.005302, 135.763840 | Still serving kogashi miso ramen. |
| [ ] | `honke-owariya` Honke Owariya Honten | Kyoto | 35.012760, 135.760162 | Several Owariya branches; confirm the honten (Kurumaya-chō, Nijō). |
| [ ] | `dotonbori-imai` Dotonbori Imai Honten | Osaka | 34.668526, 135.502594 | Several Imai records; confirm the Dōtonbori honten. |
| [ ] | `takoume-honten` Takoume Honten | Osaka | 34.668827, 135.505295 | Signature item wording (tako kanroni). |
| [ ] | `ide-shoten` Ide Shoten | Wakayama | 34.228508, 135.189514 | Broth set to `tonkotsu` (it's tonkotsu-shoyu); change to `shoyu` if you prefer. |
| [ ] | `ichiran-nakasu` Ichiran Honten | Fukuoka | 33.593163, 130.404633 | Confirm this is the 本社総本店 in Nakasu, not another branch. |
| [ ] | `ippudo-daimyo` Hakata Ippudo Daimyo Honten | Fukuoka | 33.587833, 130.395844 | Signature bowl name. |
| [ ] | `ganso-nagahamaya` Ganso Nagahamaya | Fukuoka | 33.592308, 130.386749 | The shop moved; Overture also has a "former site" record (33.592194, 130.385513). Confirm the current door. |

- [ ] After verifying, remove "Shop details unverified" from the panel footer in `index.html`.
- [ ] `npm run validate` prints no unverified shops.

## 4. Data sources & licenses

- [ ] **PLATEAU site policy**: confirm the CC BY 4.0 option and the credit wording
      **出典：国土交通省 Project PLATEAU** at <https://www.mlit.go.jp/plateau/site-policy/>.
- [ ] **PLATEAU docs**: confirm the catalog API and streaming URLs at
      <https://docs.plateauview.mlit.go.jp>, and whether a newer ortho layer than
      `plateau-ortho-2023` exists (update `src/sources.ts` if so).
- [ ] **Building info works for a Tokyo shop with LOD2**: open `/?debug=plateau#rokurinsha-tokyo-station`
      (Chiyoda-ku, `13101`), tap **Building info**, click Tokyo Station's buildings.
  - [ ] The panel shows usage, year, height, storeys and any hazard lines in plain English.
  - [ ] Compare the console's "PLATEAU feature properties" with `src/map/plateau-attributes.ts`;
        add any property names it misses.
  - [ ] The vermilion highlight is visible on the picked roof over Google's tiles; if it isn't,
        "Data view" still shows it (and tell me: the lift may need tuning).
  - [ ] A shop in a ward without PLATEAU data simply doesn't show the button.
- [ ] **GSI**: confirm the tile URLs, zoom ranges and credit on
      <https://maps.gsi.go.jp/development/ichiran.html>, including any extra credits for the
      low-zoom satellite mosaic. With no key, browse the coastal shops (Fukuoka, Osaka, Wakayama)
      at street level and check the console: if GSI returns 404s over the sea, tell me and we'll
      cap the zoom there.
- [ ] **GSI stays fallback-only.** If the map ever becomes the site's main content on GSI, check
      whether an application is needed.
- [ ] **Overture**: confirm the license for release `2026-09-23.1` on
      <https://docs.overturemaps.org/attribution/>. When you re-run discovery on a newer release,
      update the release mentioned in `src/sources.ts`.
- [ ] **OSM**: nothing in `shops.json` is from OSM today. If that changes, mark those shops
      `"dataSource": "osm"` (the credits page then adds the ODbL notice by itself).
- [ ] Every `"checked"` date in `src/sources.ts` is recent after you've re-read the terms.

## 5. Content & brand

- [ ] Replace `public/og.png` (1200×630) with a real hero image (keep text legible small).
- [ ] Shop photos: add only with a visible credit and a license (`photo.credit`, `photo.license`).
- [ ] Shop videos (`videoUrl`): our own footage, hosted on R2 or similar.
- [ ] Replace the procedural "Step inside" placeholder with our own capture
      (README §6), or remove `splatUrl` from AFURI Ebisu before launch if you'd rather not ship it.
- [ ] Never ship a third-party splat, photo or video without a confirmed license.

## 6. Legal pages

- [ ] Publish a **privacy policy** (Google Maps Platform terms require one in your app). Mention
      Cloudflare Web Analytics (cookieless) and that Google serves the map and Street View.
- [ ] Keep the Google terms links on /credits ("Map terms") or move them to a terms page, and link
      it from the map UI.

## 7. Final QA on the live site

- [ ] Lighthouse **mobile** on `/` and `/credits/`: Accessibility, Best Practices and SEO ≥ 90.
- [ ] Chrome (desktop + Android), **Safari** (iOS + macOS), **Firefox**:
  - [ ] Tokyo starts framed immediately; city/shop flights respect "Reduce motion"
  - [ ] pins cluster when zoomed out and split up when zoomed in
  - [ ] list click → fly-to → card; `/#ichiran-nakasu` opens directly; copy link works
  - [ ] bottom sheet drags and snaps on a phone; nothing covers the Google/Cesium credits
  - [ ] Stand outside, Building info, Tonkotsu Trail, Step inside
  - [ ] keyboard only: Tab through the panel and card with a visible focus ring; Escape closes things
- [ ] With the key removed (Preview deploy without `VITE_GOOGLE_MAPS_KEY`): GSI globe, "3D
      unavailable" chip, **no console errors**.
- [ ] Throttled "Fast 4G" on a mid-range phone: the list is usable within ~3 s; the map arrives
      behind the steam loader.
