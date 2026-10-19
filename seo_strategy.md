# SEO Strategy

## In scope
- Public Soupmap worldwide soup atlas, currently a Japan pilot.
- Homepage discovery list, public shop discovery/deep links, `/credits/`, paginated `/catalog/` and `/city/<slug>/` directories, and eligible `/shop/<slug>/` documents.
- Source-detectable WCAG 2.2 A/AA accessibility in public discovery flows.

## Target audience and topics
- Curious travelers finding soup and noodle shops; ramen, udon, soba, oden and Japan city discovery.
- Brand positioning: “Find your next bowl. Anywhere.” Do not imply overseas listings already exist or describe unverified records as independently checked recommendations.

## Rendering and crawler assumptions
- Vite static multi-page build with build-time prerendered homepage shop list, credits, nationwide/city directories and substantive shop documents. Interactive map, filters and detail cards render in the browser.
- Basic open-data records are exposed in directory HTML, not thin standalone shop pages. Shared eligibility in `src/data/indexation.ts` governs pages, shop/share links and sitemap inclusion.
- Search, social preview and AI crawler visibility matter. Judge initial HTML separately from JavaScript-rendered UI.
- The build emits robots.txt, sitemap.xml and an optional llms.txt guide. No intentional AI crawler exclusions are recorded. Cloudflare policy review is documented for deployments that actually use its hosting/proxy; Web Analytics alone is not an edge deployment.
- Canonical origin should be the actual published deployment origin, configured with VITE_SITE_URL; no production origin is confirmed by this scan.
- Private local shortlists are not standalone indexation targets.

## Out of scope
- Internal maintenance scripts and authenticated tools, except configuration affecting public pages.

## Dismissed categories
- None.
