import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { readFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import sirv from "sirv";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware.ts";
import { personalApi } from "./api.ts";
import { ListStore } from "./lists.ts";
import { recipesApi } from "./recipes-api.ts";
import { ReviewStore } from "./reviews.ts";
import { readdirSync } from "node:fs";

const app = express();
const httpServer = createHttpServer(app);
app.disable("x-powered-by");
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({credentials:true, origin: false}));
app.use(express.json({limit:"64kb"}));
app.use(express.urlencoded({extended:true, limit:"64kb"}));
// Public map/content do not depend on the identity provider being reachable.
app.use("/api", clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
})));
// Recipe reviews are public to read, so they mount before the account-only API.
const recipeSlugs = new Set(readdirSync(resolve("content/recipes")).filter(name => name.endsWith(".md") && name !== "README.md").map(name => name.slice(0, -3)));
app.use("/api/recipes", recipesApi(new ReviewStore(), recipeSlugs));
app.use("/api", personalApi(new ListStore()));
app.use("/api", (_req, res) => { res.status(404).json({error:"Not found."}); });

const production = process.env.NODE_ENV === "production";
if (!production) {
  const {createServer} = await import("vite");
  // Share the forwarded HTTP server; a separate HMR port is not reachable
  // through the HTTPS Preview proxy.
  const vite = await createServer({
    server: { middlewareMode: true, ws: { server: httpServer } },
    appType: "mpa",
  });
  app.use(async (req, res, next) => {
    if (!/^\/(?:account|sign-in|sign-up)(?:\/|$)/.test(req.path)) { next(); return; }
    const html = await readFile(resolve("account/index.html"), "utf8");
    res.type("html").send(await vite.transformIndexHtml(req.originalUrl, html));
  });
  app.use(vite.middlewares);
} else {
  app.use((req, res, next) => {
    if (/^\/(?:account|sign-in|sign-up)(?:\/|$)/.test(req.path)) {
      res.setHeader("Cache-Control", "no-store");
      res.sendFile(resolve("dist/account/index.html"));
    } else next();
  });
  app.use(sirv("dist", {etag:true}));
}
app.use((_req, res) => { res.status(404).type("text").send("Page not found."); });
app.use((error: Error & {status?: number}, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const limited = error.message === "LIST_LIMIT";
  const status = limited ? 409 : error.status && error.status >= 400 && error.status < 500 ? error.status : 500;
  if (status === 500) console.error("Request failed:", error.name);
  res.status(status).json({error:limited ? "A list can hold up to 1,000 places." : status === 500
    ? "Your changes could not be saved. Please try again." : "Invalid request."});
});
// Respect the standard dev-server --port flag used by preview hosts. PORT remains authoritative.
const portArg = process.argv.indexOf("--port");
const port = Number(process.env.PORT || (portArg >= 0 ? process.argv[portArg + 1] : undefined)) || 5000;
httpServer.listen(port, "0.0.0.0", () => console.log("Soupmap serving on port " + port));
