---
name: SEO page graph policy
description: Rules for city guides, the indexing quality gate, sitemaps, IndexNow and recipe/catalog cross-links.
---
The user asked to scale toward 5,000 interlinked pages (recipes, catalog, city × style guides) for Google, people and AI agents.

**Why:** Pages built from unverified open data can look like scaled, thin content. The gate keeps only pages that stand on their own in the index, and the wording keeps the guides honest about what the data is.

**How to apply:**
- Every generated page goes through src/seo/quality.ts before it reaches a sitemap. Don't bypass it or loosen thresholds to raise page counts; fix the content instead (the gate once caught thin recipe browse descriptions).
- Guides are listings, not rankings: no "best" or "top rated" claims, styles are "names point to…", and no shop rating is invented. Open-data shops without editorial notes still get no standalone /catalog/<slug>/ page (src/data/indexation.ts).
- English municipality names come from official kana (localgovjp, CC0) via scripts/build-municipalities.ts, never from the catalog's generated romanizations. Snippets and JSON-LD cite a shop's source or editorial name, or its Japanese name, not a machine reading.
- /sitemap.xml must keep serving the sitemap index (it is the URL in Search Console). IndexNow submits only changed sitemap URLs; Google doesn't use IndexNow.
