---
name: Catalog compression transport
description: Avoid double-decoding the compressed open-data catalog across static hosts.
---

Detect gzip by its byte signature rather than assuming a `.gz` response body is still compressed.

**Why:** Vite serves the catalog with `Content-Encoding: gzip`; browser fetch already decompresses it. Other static hosts may return the raw gzip file. Blindly decompressing twice prevented app startup.

**How to apply:** Keep both transport cases covered by tests whenever changing the catalog loader or deployment hosting.
