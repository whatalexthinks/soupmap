---
name: Catalog growth
description: Static discovery and protected visitor/owner conversion APIs.
---
Catalog restaurant canonicals are `/catalog/<slug>/`; `/shop/<slug>/` permanently redirects. Identify restaurant entities by structured data in the quality gate, not a legacy URL prefix. Preserve the segmented sitemap index and the existing recipe/guide graph.

Catalog reads are build-time static: do not initialize Clerk, query PostgreSQL, or load Google Maps on a plain page view. Interactive map loading requires visitor intent. Lead capture is email-only, separately opt-in for marketing, and reports queued delivery honestly. Passport stamps are account-scoped; legacy diary notes remain local.

Claims require ownership review. Paid placement is labeled sponsored and never confers an award. Ratings and ranked badges require sourced publication data. Configure commerce.json and review before rebuilding. Migration 004 and production prerequisites are documented in docs/catalog-growth.md.
