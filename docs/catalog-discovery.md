# Directory and Google restaurant profiles

## What changed

- `/catalog/` and `/city/:city/` are usable directories: compact cards, English/Japanese search across the catalog, city and food-style filters, editorial selections, saved places, known-chain exclusion, and name/distance sorting.
- 24 records per page in static HTML and the enhanced view. Static page/range links remain crawlable; no WebGL is loaded by the directory.
- Filters are URL-backed. Latitude and longitude from “Nearest to me” stay in memory and are never put into URLs or browser storage. Distance is straight-line, not walking time.
- Curated profiles remain at `/shop/:slug/`. Imported records open an in-site profile via `/catalog/?place=:slug` without creating thousands of thin indexable shop documents. With JavaScript unavailable, the static directory and curated profiles remain readable; imported profile dialogs require JavaScript.
- Saves share the map's device key. Signed-in saves use the existing account API. Device saves are not automatically imported or overwritten by account saves.
- Source IDs, licensing and verification remain accessible in expandable source details. Editorial notes are distinct from live Google information; unknown hours, prices and menus are never filled with invented values.

## Google setup

The existing browser key `VITE_GOOGLE_MAPS_KEY` is used. In its Google Cloud project:

1. Enable **Places UI Kit**, alongside **Maps JavaScript API**. Keep **Map Tiles API** enabled for the existing 3D layer.
2. Allow those services in the key's API restrictions and permit the actual production/preview HTTP referrers. Keep browser keys referrer-restricted.
3. Confirm billing and set appropriate usage quotas and budget alerts. Alerts alone are not a spending cap. Use current Google pricing; no hard-coded cost claims are made here.
4. Rebuild after changing the Vite environment key. Enablement/restriction changes are managed in Google Cloud.
5. Verify a curated shop and an imported shop on a phone and desktop. Click “Load Google details”, select the correct name/address, check photos, hours, reviews, attribution and external links. Confirm quota/denial errors show a useful fallback and Street View still works after restaurant lookup.

No Google API configuration or billing settings were changed by this code update. Live Google responses and production credentials must be verified in the deployed project.

## Why Places UI Kit

Google's current service-specific terms distinguish the raw Places API from the Places UI Kit. UI Kit section 15 explicitly permits use alongside a non-Google map. This supports Soupmap's Cesium/GSI/PLATEAU fallback rather than rendering raw Places API results on it.

The implementation uses only the documented `gmp-place-search` and `gmp-place-details` elements. It themes documented color/font tokens, leaves attribution and source links intact, and does not extract widget content or add Google POIs to our own catalog. Photo/review rendering stays within Google's components. No scraping, bulk enrichment, photo URL storage, or persistent caching of Google data.

One explicit lookup searches the selected shop's name near its open-data coordinates, returning at most three candidates. The visitor confirms the branch; there is no silent first-result matching. Details load only after that choice. Error, auth-denial and timeout states preserve direct Google Maps links. Closing/changing a card discards stale responses and clears the widget.

References (checked 2026-10-19):
- https://cloud.google.com/maps-platform/terms/maps-service-terms (sections 14 and 15)
- https://developers.google.com/maps/documentation/javascript/places-ui-kit/get-started
- https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-search
- https://developers.google.com/maps/documentation/javascript/places-ui-kit/place-details
- https://developers.google.com/maps/documentation/javascript/places-ui-kit/custom-styling

## Verification

DOM tests cover filters, pagination, empty states, imported-profile links, keyboard focus, shared guest saves, account isolation and denied geolocation. Mocked Google widget events cover explicit loading, branch selection, native attribution, failures, timeouts and stale requests. Static indexation tests retain catalog coverage, canonical URLs, metadata and sitemap traversal. These checks do not substitute for a live Google/browser check.
