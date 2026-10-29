---
name: Open-data catalog policy
description: Source choice and truthfulness requirements for expanding Soupmap listings.
---

The user chose “Build out the open-data catalog” over live Google Places search when expanding soup-shop coverage across Japan.

**Why:** The user explicitly selected the open-data approach. Do not replace it with billable Google Places discovery without asking.

**How to apply:** Expand coverage from attributed open datasets. A sourced location is not a verified recommendation; preserve unknown details instead of inventing menu, price, hours or broth classifications.

A shop's own name is evidence, not invention: "味噌ラーメン〇〇" may set a miso broth, but only
with `brothSource: "name"` and the interface saying "from the name". Broad categories such as
`ramen_restaurant` never imply a broth. Contact details come only from the source record.

**Why:** The user asked for better information without abandoning the no-invention rule.

**How to apply:** Add style patterns narrowly (place names like 塩釜/塩尻 must not read as shio; 博多うどん is not tonkotsu) and keep the tests in `tests/catalog-quality.test.ts` green.

Soupmap selections (curated shops in src/data/shops.json) grew from 15 to 35 on 2026-10-29 at the user's request ("grow the soupmap collections"). New ones are promoted from Overture records (same `sourceId`, which hides the open-data duplicate), keep `verified: false`, null price and hours, and contact details only from the record. Places Overture doesn't have were skipped rather than pinned by guesswork.

**How to apply:** Only the user marks a selection verified, after checking it. Founding years and "origin of the style" claims in blurbs need a source; when sources disagree, leave the year out.

On 2026-10-20 the user explicitly requested Google restaurant photos and information in Soupmap's own profile design. The directory keeps its open-data base; on-demand Places UI Kit panels add live Google information in catalog profiles and map cards. Use UI Kit's documented components and theme tokens, since its terms permit non-Google maps. Do not substitute raw Places API results on Cesium, silently match a branch, bulk enrich the catalog, or persist Google photos/reviews. See `docs/catalog-discovery.md`.
