---
name: Lockfile registry
description: package-lock.json must resolve to the public npm registry.
---

Replit's package firewall rewrites `resolved` URLs to `http://package-firewall.replit.internal/`.

**Why:** Those URLs only resolve inside Replit; `npm ci` fails on Cloudflare Pages, CI and fresh
clones. It has happened twice, and once caused a merge conflict on the user's pull request.

**How to apply:** After any install, repoint them to `https://registry.npmjs.org/` (same tarballs
and integrity hashes). `tests/catalog-quality.test.ts` guards this.
