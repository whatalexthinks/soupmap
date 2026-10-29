---
name: Recipes policy
description: Rules for /recipes/ content, photos and reviews, so they stay trustworthy.
---
The user asked for a recipes section with "incredible" recipes, many ways to sort and categorize, reviews and custom tips, and "real pictures of each soup".

**Why:** Recipes are instructions people follow with heat, knives and allergies. A wrong diet tag or an unsafe step does real harm, and a fake or unlicensed photo breaks the project's source rule.

**How to apply:**
- Recipes follow content/recipes/README.md: honest times, proven ratios, food safety, no invented experiences, own words. Diet tags must hold for the recipe exactly as written; the parser checks them against ingredients.
- Photos: real photographs with a verified free licence (CC0, PD, CC BY, CC BY-SA) and credit on the page, via scripts/fetch-recipe-photos.ts. Never AI-generated, stock-without-licence or hotlinked unverified images. A person chooses each photo.
- Reviews: public to read, account to write, one per account per recipe, no links, report-to-hide with moderator restore. Keep reviews out of the static pages; the only rating in structured data is the real aggregate added at serve time (server/recipe-pages.ts), shown visibly too.
- Meters (richness, spice, comfort) are editorial and say so. Cost per bowl and nutrition appear only from sourced entries in content/recipes/costs.json and nutrition.json; never estimate them. Shopping links only when an affiliate programme is configured, always rel="sponsored nofollow" with the disclosure.
