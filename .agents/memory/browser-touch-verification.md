---
name: Browser touch verification
description: Avoid a false scrolling failure in automated Chromium touch checks.
---

In this environment, CDP `Input.synthesizeScrollGesture` with `gestureSourceType: "touch"` can complete without scrolling, even on an isolated plain overflow container.

**Why:** The same page scrolled normally when driven by explicit touch events; the synthetic gesture's no-op was not an application scrolling failure.

**How to apply:** Verify native touch scrolling with `Input.dispatchTouchEvent`: touch start, several touch moves separated by frames, and touch end. Assert the intended scroll container's `scrollTop` changes. A successful mouse-wheel check alone does not prove touch scrolling works.
