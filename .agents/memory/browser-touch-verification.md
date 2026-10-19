---
name: Browser touch verification
description: Avoid a false scrolling failure in automated Chromium touch checks.
---

In this environment, CDP `Input.synthesizeScrollGesture` with `gestureSourceType: "touch"` can complete without scrolling, even on an isolated plain overflow container.

**Why:** The same page scrolled normally when driven by explicit touch events; the synthetic gesture's no-op was not an application scrolling failure.

**How to apply:** Verify native touch scrolling with `Input.dispatchTouchEvent`: touch start, several touch moves separated by frames, and touch end. Assert the intended scroll container's `scrollTop` changes. A successful mouse-wheel check alone does not prove touch scrolling works.

The default screenshot browser may lack WebGL, but a separate Chromium process using `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` can render the real 3D map here.

**Why:** The normal capture showed only the non-WebGL fallback; explicit software rendering successfully displayed streamed Google 3D imagery and the live camera descent.

**How to apply:** Use a temporary profile and CDP for real WebGL checks when the normal capture cannot render it. Inspect camera state, document navigation counts and a settled screenshot without serializing credentials or API request URLs. Software rendering can be slow; do not treat its frame rate as a physical phone benchmark.
