# Shop candidates (review queue)

`npm run discover` writes one file per city here: `data/candidates/<city>.json`.

These are **leads**, not data we publish:

- Every candidate must be checked by a person before anything goes into `src/data/shops.json`.
- OpenStreetMap leads are ODbL (share-alike). The JSON files are git-ignored so we don't
  redistribute OSM data by accident. Review them locally.
- Overture leads keep their per-record license (mostly CDLA Permissive 2.0, some Apache 2.0).

Each candidate has `source`, `sourceId`, `name`, `name:ja`, `lat`, `lng`, `website`,
`opening_hours`, `category`, `matchedBy`, `license`, `confidence` and `alreadyListed`
(the slug of a shop we already list within 75 m). See the README section "Promote a candidate".
