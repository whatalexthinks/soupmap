---
name: Mobile map performance
description: Cesium canvas texture identity can defeat otherwise bounded JavaScript pin caches.
---

A JavaScript canvas cache does not bound Cesium's GPU texture atlas. Recreated canvas billboards need explicit, shared image IDs.

**Why:** Cesium assigns random image IDs to raw canvas inputs. Recreating cluster billboards could therefore upload duplicate images on every camera refresh, even when the canvas objects were reused. Repeated real-WebGL refreshes with shared image IDs kept the atlas image count unchanged.

**How to apply:** Reuse stable texture IDs when adding or updating canvas billboards, keep count-badge variants bounded, and verify GPU atlas image counts after repeated refreshes—not just JavaScript cache sizes. A stale-pin eviction limit also does not limit the active pins in a dense viewport; cluster those rather than dropping searchable locations.

Use adaptive mobile quality: lightweight rendering while moving, sharper nearby geometry and a capped retina buffer when stationary. Keep tile-memory limits independent of close-up detail.

**Why:** The user wants both faster phone loading and higher-quality close-up 3D. Raising resolution and detail everywhere would increase network/GPU work during navigation and risk repeating the earlier mobile slowdowns.

**How to apply:** Improve detail only at close camera heights after gestures end; restore the movement budget when navigation resumes. Keep the homepage free of automatic map-engine loading; renderer preloading belongs on the map route.
