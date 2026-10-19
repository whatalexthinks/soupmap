# Passport branch integration

The passport/community checkpoint now includes main's redesigned homepage, map startup fixes, account saves, shared lists, Street View, and nearby history.

- Keep the homepage as a separate document. Chapters, Passport, Field notes, the collection banner, and the native dialog live in `/map/index.html`.
- Load journey styling from the render-blocking app stylesheet, using the shared warm palette and no backdrop blur.
- Generate collection links under `/map/`. Older root-level `?hub=` and `?collection=` links redirect to the map.
- Preserve cuisine, language, distance, saved, and shared-list behavior. Starting a chapter clears incompatible shared-list filters. Account collection saves use the existing authenticated save helper and do not write account places into guest storage.
- Retain the current shop layout and history controls alongside visit and contribution actions.
- Bound the field-note selector to featured places plus the currently opened shop, rather than rendering 32,664 options. Any imported shop can be targeted by opening it on the map first.

## Availability

Visits, private notes, achievements, chapters, and passport backup/import work locally. They are separate from account lists and do not claim cross-device passport sync.

Public contributions and moderation remain the optional Cloudflare D1 implementation from the checkpoint. They require `COMMUNITY_DB`, the community SQL migration, and a `COMMUNITY_ADMIN_TOKEN` of at least 32 characters. The current Express/Postgres deployment does not expose that adapter. The UI keeps submissions disabled when unavailable, supports local drafts, and never claims a note was published. Connecting that backend is separate from this conflict resolution.

## Checks

TypeScript and production build pass. Existing map/account tests and new DOM integration tests cover chapter selection, visit stamps, unavailable public submissions, bounded shop choices, and account-versus-guest save isolation. Live browser and real account/database verification remain outside this pass.
