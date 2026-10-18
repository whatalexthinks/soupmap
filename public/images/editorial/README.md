# Soupmap editorial imagery

The app preview and the mood image have different provenance:

- `soupmap-phone`: the user's actual app screenshot, supplied on 2026-10-19.
  Preserve the screen's content and attribution. Show it as a screenshot preview,
  not a live embedded map.
- `ramen`: an AI-generated generic shoyu ramen bowl on a wooden counter, not
  verified photography of food served at any named restaurant.

Do not describe the real screenshot as generated or associate the ramen image
with a named shop as if it documents that shop.

The screenshot has 400px and 688px-wide WebP versions; the ramen image has 640px
and 1024px square versions. Use responsive `srcset` and `sizes`, explicit
dimensions, and lazy loading except for the lead image. Raw generation outputs
stay in the ignored `generated-artifacts/` directory.
