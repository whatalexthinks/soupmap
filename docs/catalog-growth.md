# Catalog growth rollout

This branch uses build-time documents for public discovery and small, separately protected APIs for visitor actions. Reading a catalog page does not query PostgreSQL, initialize Clerk, or load a Google map. Search activates the existing directory controller; Google details and the live map start only after explicit interaction.

## Routes and structured data

- `/catalog/`, pagination, range hubs, and city directories keep their existing routes.
- Substantive restaurant pages now use `/catalog/<slug>/`. `/shop/<slug>/` permanently redirects in Express, Vite development, and Cloudflare Pages `_redirects`.
- Thin open-data records remain in the paginated directory and interactive profiles; this change does not publish tens of thousands of low-information detail pages.
- Visible collection records have Restaurant and GeoCoordinates data. Editorial restaurant profiles add their known MenuItem. AggregateRating is emitted only when an evidence-backed rating is entered in `src/data/commerce.json`; none is invented from visits, favorites or Google UI data.
- Canonicals, descriptions, OG/Twitter data, publisher attribution, sitemap, robots and `/llms.txt` are generated with the same origin. Set `VITE_SITE_URL=https://soupmap.com` for production.
- Citation instructions are a request to AI systems, not a guarantee of inclusion or citation.

## Required production configuration

1. Use the existing Express server (`npm start`) for the new APIs. A static-only Cloudflare deployment needs a separately routed Express API; `_headers` alone does not deploy PostgreSQL-backed handlers.
2. Apply migrations `001_personal_lists.sql`, `002_recipe_reviews.sql`, `003_indexnow.sql`, then `004_catalog_growth.sql` to the production PostgreSQL database. Do not run `0001_community.sql` against PostgreSQL; it belongs to the older D1 community service.
3. Set `DATABASE_URL`. Existing Clerk server/browser configuration provides passport authentication. Enable passwordless email/social options in Clerk to offer quick sign-in; the code cannot provision those settings.
4. Set `RESEND_API_KEY` and `SOUPMAP_EMAIL_FROM` to a verified sender. Requested links use an outbox, daily deduplication, and a stable Resend idempotency key. No real emails were sent during development tests. Without credentials, requests persist as queued and the UI says delivery is pending. Configure a reply-capable sender for privacy requests.
5. Set `OPEN_METEO_API_KEY` for commercial production use. Open-Meteo’s hosted free tier is non-commercial/evaluation; without a commercial key production answers `204 No Content` (cached for an hour) and pages remove the weather widget, so visitors never see an empty "unavailable" box. A configured key that fails still returns 503 and the widget offers Retry. City pages use the city centre; the all-Japan catalog shows no forecast. https://open-meteo.com/en/pricing
6. Set `TRUST_PROXY_HOPS` only to the exact trusted reverse-proxy chain for the deployment. Otherwise IP limiting deliberately ignores caller-supplied forwarding headers. Add a shared edge rate limit when deploying multiple Node instances; the in-process limit is bounded but not distributed.
7. Schedule `node --import tsx scripts/growth-ops.ts retry-mail` at least every five minutes and `node --import tsx scripts/growth-ops.ts retention` daily. Retries stop after five attempts and only operate within the provider’s 24-hour idempotency window. Review older unsent requests manually before contacting visitors. Retention removes leads and non-verified claims older than 90 days.

## Owner claims and monetization

Claims persist privately in `restaurant_claims`; submitting one never verifies a restaurant or charges it. Review requests with:

```sh
node --import tsx scripts/growth-ops.ts queue
node --import tsx scripts/growth-ops.ts verify CLAIM_UUID https://example.com/ownership-evidence
node --import tsx scripts/growth-ops.ts feature SHOP_SLUG 2027-03-01T00:00:00Z https://restaurant.example/order
```

The operator must establish the claimant’s authority before `verify`, and agree commercial terms before `feature`. These commands prepare the publication manifest; rebuild and deploy after reviewing it. They do not purchase a service or process payments. Rebuild at promotion expiry so static featured cards remain current; live markers check expiry on use.

- Verified-owner labels distinguish ownership from the existing on-the-ground location verification.
- Active featured profiles get a gold marker, sponsored label, city-guide priority, and configured order link. Non-guide sorting still respects the visitor’s chosen order.
- `orderUrl` and `reserveUrl` are HTTPS links; outbound tracking preserves existing affiliate parameters and adds `utm_source=soupmap.com`. Paid links carry `rel="sponsored noopener"`.
- `affiliates` entries accept `title`, `description`, HTTPS `url`, and `cuisines`. Empty configuration shows the useful recipe CTA instead of invented products or dead purchase buttons.
- Optional `rating` requires a real `value`, `count`, `source` URL, and `checkedAt` date. Publish only ratings you have rights to reuse and show them visibly on the page.
- Optional `award` requires a short `label`, public `evidenceUrl`, and ISO `expires`. Use “Ranked Top Soup Spot” only when a published ranking supports it. Featured purchases never earn this badge.
- `/api/growth/badge/<slug>.svg` produces a free linked badge. Without an award it says “Find us on Soupmap” or “Verified restaurant on Soupmap”. The claim page supplies an ordinary followable HTML backlink. Badge content changes with approved publication data, not form inputs.

## Passport and privacy

The five-bowl widget uses account-scoped `account_passport` rows. Repeating a check-in is idempotent; undo deletes it. Sign-in returns to the visitor’s current page. Stamps are fetched on first interaction only when Clerk's readable `__client_uat` cookie says a session may exist (`src/session-hint.ts`), so guests don't each send a request that can only answer "sign in". Existing local diary entries and notes remain local and are not silently imported. The account widget explicitly stores account stamps; legacy diary notes remain a separate device feature.

Email capture sends one requested link and records marketing consent separately, defaulting to false. No bulk marketing sender is included. The application never sends emails or owner notices merely because a crawler reads a document. Support should handle deletion requests from the original email address. Keep operator queue output private.

## Traffic protection and caching

Public documents are emitted once during the build. Catalog/city HTML and discovery files have ETags and CDN caching (five minutes in browsers, one hour at the edge, stale-while-revalidate). No account data is embedded in cacheable HTML. Account and submission APIs are no-store and noindex. The weather cache rounds to 0.1 degrees, deduplicates concurrent fetches, lives for 15 minutes, bounds memory, rejects stale/invalid responses, and times out after five seconds.

Robots rules allow public crawling by Googlebot, Bingbot, Applebot, OAI-SearchBot, ChatGPT-User and PerplexityBot. APIs and private account routes are excluded. Bytespider, CCBot and Diffbot are additionally denied API responses. User-agent blocking is only a courtesy filter, not authentication; IP quotas and the edge limiter provide actual protection.

## Validation

Baseline latest main: 206 passed, zero failed, two database integration tests skipped because DATABASE_URL was not configured. The previously reported 14 failures were not present in this checkout. New tests cover schema omissions, verified promotion/award boundaries, outbound URL safety, crawler policy, weather coalescing and freshness, lead/claim validation, failure responses, owner-isolated passport writes, and API rate limits.

Final validation after integrating main’s recipe/SEO expansion: 227 tests passed, zero failed, two database integration tests skipped. TypeScript and the Vite production build passed. Existing shop-data validation passes with coordinate-boundary warnings in the imported catalog. DOM tests exercise weather retry, explicit marketing consent, queued email feedback, passport stamps, and undo. Visual browser QA remains outstanding: the browser binary download failed and the cloud browser could not reach the local server. No production database migration, email delivery, payment, or deployment was performed.

The integration preserves main’s city guides, recipe links and live reader-rating injection, IndexNow, recipe JSON feed, llms-full.txt and segmented sitemaps. Restaurant canonical pages retain entity-level quality checks. The combined build lists 3,560 sitemap URLs; 3,483 assessed pages are indexable and 1,553 are noindex (additional core/journal pages are outside that assessed count). Production HTTP checks confirm catalog pages, legacy redirects, claims, badges, guides, sitemap segments, AI citation guidance and bot blocking.

## Round 3 review (browser QA)

The outstanding visual QA was done in Chromium at 1366 px and 390 px across every page type. Fixes:

- **Save on static pages.** Save buttons show on load with this device's saves. The first click loads the directory (and the account, for a browser with a session), then applies what the visitor saw: a signed-in visitor's first save waits for their account rather than landing on the device.
- **Restaurant page order.** Name, actions, facts, notes and contact come first. The map banner, weather and growth modules follow, after a new "In Soupmap guides" section that links each selection to the indexable guides listing it (built at build time; the catalog pop-up has no guide data). Owner-verified and sponsored labels sit in the header, beside the name they describe.
- **One home-cooking box.** The generic recipes/affiliate box appears only when products are configured or the shop has no specific recipe card.
- **Brand spelling.** "Soupmap" throughout.
- **Identity failures.** `server/middlewares/optionalAuth.ts` lets requests continue signed out when Clerk can't run, so public reads (recipe ratings) keep working; account routes still refuse.

Tests: `tests/restaurant-pages.test.ts`.

