---
name: Street View host behavior
description: Google mutates renderer styles; verify real layout and control stacking, not just API success.
---

Verify native Street View visually in a real browser, including its viewport size and an accessible Back to map control.

**Why:** Google's panorama constructor writes `position: relative` onto its host. An apparently successful viewer collapsed to zero height when that host was also the full-screen frame. A body-level overlay also covered controls inside the app's separate fixed stacking context.

**How to apply:** Keep the Google-mutated renderer inside a separately sized overlay in the controls' stacking context. Mock tests must model host style mutation. API success and panorama text in the DOM alone do not establish that imagery is visible.

Google's outdoor classification can include underground station passages.

**Why:** Real Tokyo Station lookups returned underground imagery even with official Google and outdoor source restrictions.

**How to apply:** Prefer best wider-area imagery rather than nearest imagery for basement shops, disclose approximate coverage, and never promise an exact outdoor entrance based solely on Google's source filter.
