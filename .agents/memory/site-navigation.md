# Shared site identity and navigation

The user likes the typography but wants the app to feel cohesive and functional. `src/render/shell.ts` owns the wordmark and primary destinations: Discover, Map, Your Soupmap, Journal, Account. Static HTML uses the `soupmap:header` marker; generated documents use `siteHeader`. Keep the logo a real home link, including on the map. Authentication must not redirect someone away from the public homepage.

Use `palette.css` for warm paper, ink, clay and stone; `site-shell.css` for global navigation. Keep page-specific controls separate from the main navigation. The homepage search opens Discover, saved-place names open restaurant profiles, and explicit map actions open the map. Guest browsing, saves and planning remain available without signup.
