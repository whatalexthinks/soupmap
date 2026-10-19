# Soupmap design refresh

Built from main `38b6da7`.

The direction is warm Japanese minimalism with a restrained brutalist structure: uncoated ivory, warm stone, soot brown, fired clay, generous spacing, oversized sans-serif typography, straight edges, and visible rules. The website stays a global soup atlas with a clearly identified Japan pilot.

## What changed

- A rebuilt homepage leads from an editorial image and public-map entry into a working seven-city index, product explanation, and optional account creation.
- City previews come from existing curated records and open real shops on the map. Every city also has an ordinary directory link. Without JavaScript, the initial Tokyo preview and directory links work normally.
- A single shared palette carries through the map, directory, credits, account pages, and Clerk appearance. Correct variable font family names replace fallback fonts; the unused display-font imports are removed.
- Numbered map rows give shop names and neighborhoods more space. Shop cards show the bowl and practical facts before directions and Street View. Existing real photo/video support remains; missing photos use typography rather than a simulated bowl image.
- Mobile search stays compact and map overlays remain opaque. Existing map attribution, sheet geometry, keyboard handling, history, saved lists, and account import semantics remain intact.

## Image provenance

The anonymous homepage image is labeled AI-created and is never attached to a restaurant record. It was generated with the built-in image tool, then encoded into responsive WebP assets. See [the asset note and exact prompt](../public/images/README.md).

## Verification

- TypeScript check passes.
- 104 tests pass; the existing PostgreSQL integration test is skipped without a configured test database.
- Production Vite build passes, including prerendered directories and initial homepage city content.
- CSS parsing and breakpoint nesting checked. Core text/paper and button contrast checked; supporting text darkened for warm-stone backgrounds.
- Live browser screenshots, touch testing on a physical phone, and authenticated account flow testing remain outstanding. No deployment or main-branch merge is included.
