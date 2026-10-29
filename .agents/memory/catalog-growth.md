---
name: Catalog growth
description: Static discovery and protected visitor/owner conversion APIs.
---
Catalog restaurant canonicals are `/catalog/<slug>/`; `/shop/<slug>/` permanently redirects. Identify restaurant entities by structured data in the quality gate, not a legacy URL prefix. Preserve the segmented sitemap index and the existing recipe/guide graph.

Catalog reads are build-time static: do not initialize Clerk, query PostgreSQL, or load Google Maps on a plain page view. Interactive map loading requires visitor intent. Lead capture is email-only, separately opt-in for marketing, and reports queued delivery honestly. Passport stamps are account-scoped; legacy diary notes remain local.

Claims require ownership review. Paid placement is labeled sponsored and never confers an award. Ratings and ranked badges require sourced publication data. Configure commerce.json and review before rebuilding. Migration 004 and production prerequisites are documented in docs/catalog-growth.md.

Round 3 (2026-10-29) browser QA of this work: Save buttons must work on static pages without loading the directory first (show device saves; the first click loads it and applies the visitor's choice). Restaurant pages put what a visitor came for first; growth modules follow. Paid/owner labels go beside the name. Don't show a widget that can only say "unavailable" (weather without a key returns 204 and is removed). Guests aren't sent to protected APIs on page interaction; `src/session-hint.ts` is the shared signed-in hint.

**Why:** the merged growth features had never been seen in a browser; each of these was a visible regression or a wasted request per visitor.
