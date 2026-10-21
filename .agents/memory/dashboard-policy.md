---
name: Your Soupmap dashboard
description: What /me/ is for and the rules it keeps, so later changes don't turn it into a gate or a tracker.
---
/me/ is the personal hub: plan a trip, keep places, collect bowls, get suggestions. It exists because the user said the app's "workflow and user value is kind of trash" and asked for dashboards that add value for anyone visiting.

**Why:** Visitors had no starting point and no reason to return; saves, passport and account lists were scattered across the map, dialogs and /account.

**How to apply:**
- Planning and browsing stay public. Saving places, trips or passport memories requires an account; never fall back to device storage. Legacy device saves join an account only through explicit, additive import.
- Suggestions come only from the catalog plus the visitor's own saves and visits, computed in the browser. No tracking or profiles. Plan reasons describe facts ("Tsukemen, from the name", "Editor's pick"), never quality, opening hours or menus.
- A regional bowl counts only when the place serves that bowl (named style, or the right kind of shop in the right place), not anything eaten in the region.
- The dashboard reads auth only via GET /api/me, so auth work in src/account.tsx and server/ stays independent.

**Why (saving policy):** The user changed the requirement: “for people to save something they cannot save to device they need to be prompted to create an account or submit there email everywhere appropriate and with good sales technique.”
