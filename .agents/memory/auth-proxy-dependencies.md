---
name: Authentication proxy dependency boundary
description: Why the Clerk proxy uses its transport directly rather than a general-purpose middleware wrapper.
---

Keep the Clerk proxy limited to its fixed upstream and exact Express mount; it does not need glob/path-matching dependencies.

**Why:** The general-purpose middleware wrapper pulled an unpatched braces vulnerability into production through micromatch. Downgrading that wrapper would discard newer transport fixes, while the underlying transport can preserve the same request/response behavior without the vulnerable chain.

**How to apply:** Before adopting a new canonical proxy example or reintroducing a wrapper, check its entire dependency tree. Preserve raw request bodies, cookies, proxy identity headers, compressed response bytes and bodyless statuses; retain local transport tests and the mount-before-body-parsers ordering.
