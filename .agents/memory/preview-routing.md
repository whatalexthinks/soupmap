---
name: Preview routing
description: An explicit internal port in the Preview address can make a healthy application appear unreachable.
---

Compare the exact Preview address with the normal development proxy URL before restarting or modifying a healthy server.

**Why:** The user's Preview retained `:5000` in its development URL and returned HTTP 502, while the same development domain without that port returned HTTP 200. The server and forwarding configuration were already correct.

**How to apply:** Check both the normal development domain and the exact address shown in Preview. If only the explicit internal-port address fails, remove the port from the Preview address rather than changing the working server or external port mapping.

Verify the development WebSocket separately from HTTP.

**Why:** A subsequent screenshot exposed failed Vite WebSocket connections even though the normal proxy URL returned HTTP 200. The HTTP check had been mistaken for proof that the entire preview connection was healthy.

**How to apply:** Keep development HTTP and HMR on the same forwarded server, with secure WebSockets through the HTTPS proxy. Verify that a browser receives Vite's connected frame from the same origin, rather than relying solely on curl or a screenshot. Do not confuse nonfatal Clerk development-key warnings with transport failures.

Use transport configuration matching the installed Vite version rather than copying older middleware examples.

**Why:** The installed Vite 8 accepts transport settings under `server.hmr` only through a deprecated compatibility path; its current transport API is `server.ws`.

**How to apply:** Consult the installed Vite types when changing middleware WebSocket options, and check startup logs for deprecations as well as connection failures.
