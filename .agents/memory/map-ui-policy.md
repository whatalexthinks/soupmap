---
name: Map interaction policy
description: User expectations for compact mobile controls, readable names and navigable Street View.
---

The user wants mobile improved “without this bar at the bottom and blurry sections on the map.”

**Why:** Their phone screenshot showed the large editorial bottom panel and visible rectangular blur artifacts around overlays.

**How to apply:** Keep the collapsed mobile search compact rather than showing a permanent editorial/footer bar. Avoid backdrop blur over the map; preserve required Google attribution.

Street View must let visitors move along connected streets, not just rotate within a single static photo. Shop labels should be English-first with a Japanese-name option.

**Why:** The user complained that the original panorama was zoomed, blurry and did not let them move, and requested names “in the language we need like English.”

**How to apply:** Use an interactive panorama with proper image-detail loading and road navigation. Retain original shop names and distinguish sourced English names from approximate generated romanization; do not invent an English identity for a shop.

Discovery and stability take priority over the cinematic opening. Do not recover a graphics failure by automatically reloading the page or repeatedly attempting the intro.

**Why:** The user reported that the fly-in was glitchy and “restarting the page every time.”

**How to apply:** Keep the intro optional, preserve usable shop search if 3D pauses, and account for cache overflow—not just the nominal cache—when budgeting mobile rendering memory.
