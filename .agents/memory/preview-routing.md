---
name: Preview routing
description: An explicit internal port in the Preview address can make a healthy application appear unreachable.
---

Compare the exact Preview address with the normal development proxy URL before restarting or modifying a healthy server.

**Why:** The user's Preview retained `:5000` in its development URL and returned HTTP 502, while the same development domain without that port returned HTTP 200. The server and forwarding configuration were already correct.

**How to apply:** Check both the normal development domain and the exact address shown in Preview. If only the explicit internal-port address fails, remove the port from the Preview address rather than changing the working server or external port mapping.
