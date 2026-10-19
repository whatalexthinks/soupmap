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

Live imagery assertions need more than a single center patch, and native arrow
input needs a painted SVG point rather than its bounding-box center.

**Why:** The real Afuri view faced a plain pillar: a center-only color check
misclassified loaded imagery as blank. Google's hollow chevron center also passed
touch through to the viewer instead of activating navigation.

**How to apply:** Sample a wider image band away from controls and hit-test the
actual arrow with `elementFromPoint` before physical mouse/touch input. Do not
replace the movement check with forced clicks or direct panorama-ID assignment.
