# Historical context: Tokyo pilot

History is an **opt-in** layer in shop cards. The checked-in snapshot contains nine
landmarks and neighbourhoods, not a comprehensive Tokyo heritage inventory.
No history request, external API query, image download or map overlay is created
before the visitor opts in. The city JSON is fetched once after opt-in; failed
requests time out and can be retried. At most four entries within 2.5 km are shown.
These are approximate straight-line distances, not walking directions.
Neighbourhood coordinates are representative points, not historical boundaries.

## Evidence and rights

- Each narrative and known date cites its evidence. Each entry records when its
  sources were checked. This is a desk check, not an on-site verification.
- Use `null` for an unverified date. Do not estimate it from a building's style,
  nearby landmarks, PLATEAU year-built values or Google photorealistic imagery.
- Temple traditions, inception dates, surviving-building construction dates,
  publication dates and reopening dates are distinct facts. Preserve conflicting
  dates with explicit qualifications (for example Sensoji's 628 tradition and
  Wikidata's unreferenced 645 inception).
- Official sources contribute **facts only**, in independently written Soupmap
  prose. Their copyrighted prose and photographs are not reproduced.
- Wikidata structured identity/coordinate/date facts are CC0. This does not
  grant rights to images linked from Wikidata.
- The Ebisu summary is adapted from Wikipedia's checked permanent revision.
  Its per-entry credit identifies the article, Wikipedia contributors,
  modification and **CC BY-SA 4.0** license. That adapted summary remains
  share-alike. Contributor history is available from the linked revision.
- Japan Search's NDL record `dignl-13095504` contributes bibliographic facts:
  the compilation contains *Nihonbashi Uoichiba Enkaku Kiyo* and was published in
  **1997**. Metadata was checked through Japan Search's SPARQL endpoint
  (`schema:name`, `schema:datePublished`). The publication year is not a bridge or
  market founding date. The underlying book text, scans and thumbnails are not
  reused; no blanket content license is assumed.
- **No historical images are shipped.** Before adding any, check the individual
  item's license, creator, attribution, modification terms and source link.

## Maintaining the snapshot

Edit `public/data/history/tokyo-v1.json` only after checking actual source pages.
Use source IDs in `summarySourceIds` and each date's `sourceIds`; never cite a
discovery/search link as proof. Keep concise English-first titles and retain
Japanese names. Increment the snapshot filename and loader URL when replacing a
published release, so cached versions cannot mask corrections.

Register new providers in `src/sources.ts`. Keep the snapshot within the loader's
phone budget and schema limits. Run `npm test`, `npm run typecheck` and
`npm run build`; inspect phone cards and opt-in/off marker cleanup.

PLATEAU's existing Building info panel remains solely about physical building
attributes. Historical narratives do not modify it or claim to identify a shop's
building from a nearby representative point.
