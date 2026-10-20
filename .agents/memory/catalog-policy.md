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

On 2026-10-20 the user explicitly requested Google restaurant photos and information in Soupmap's own profile design. The directory keeps its open-data base; on-demand Places UI Kit panels add live Google information in catalog profiles and map cards. Use UI Kit's documented components and theme tokens, since its terms permit non-Google maps. Do not substitute raw Places API results on Cesium, silently match a branch, bulk enrich the catalog, or persist Google photos/reviews. See `docs/catalog-discovery.md`.
