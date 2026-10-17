# SEO Strategy

## In scope
- Public Soupmap worldwide soup atlas, currently a Japan pilot.
- Homepage discovery list, public shop discovery/deep links, and `/credits/`.
- Source-detectable WCAG 2.2 A/AA accessibility in public discovery flows.

## Target audience and topics
- Curious travelers finding soup and noodle shops; ramen, udon, soba, oden and Japan city discovery.
- Brand positioning: “Find your next bowl. Anywhere.” Do not imply overseas listings already exist.

## Rendering and crawler assumptions
- Vite static multi-page build with build-time prerendered homepage shop list and credits; interactive map, catalog expansion and shop detail cards render in the browser.
- Search, social preview and AI crawler visibility matter. Judge initial HTML separately from JavaScript-rendered UI.
- Canonical origin should be the actual published deployment origin, configured with VITE_SITE_URL; no production origin is confirmed by this scan.
- Private local shortlists are not standalone indexation targets.

## Out of scope
- Internal maintenance scripts and authenticated tools, except configuration affecting public pages.

## Dismissed categories
- None.
