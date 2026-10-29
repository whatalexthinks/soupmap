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
import { indexNowApi, indexNowConfig, keyFile, PgSubmissionLog, submitChanged } from "./indexnow.ts";
import { recipePagesWithRatings } from "./recipe-pages.ts";

const app = express();
const httpServer = createHttpServer(app);
app.disable("x-powered-by");
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({credentials:true, origin: false}));
app.use(express.json({limit:"64kb"}));
app.use(express.urlencoded({extended:true, limit:"64kb"}));
// IndexNow is the owner's tool, authorised by its own token, so it doesn't wait on Clerk.
const indexNow = indexNowConfig(process.env);
const reviews = new ReviewStore();
const submissions = new PgSubmissionLog();
app.use("/api/indexnow", indexNowApi(indexNow, submissions, process.env.INDEXNOW_ADMIN_TOKEN));
if (indexNow) app.use(keyFile(indexNow));
// Public map/content do not depend on the identity provider being reachable.
app.use("/api", clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
})));
// Recipe reviews are public to read, so they mount before the account-only API.
const recipeSlugs = new Set(readdirSync(resolve("content/recipes")).filter(name => name.endsWith(".md") && name !== "README.md").map(name => name.slice(0, -3)));
app.use("/api/recipes", recipesApi(reviews, recipeSlugs));
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
  // Recipe pages carry their real reader rating in schema.org data.
  app.use(recipePagesWithRatings(reviews));
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

// Each publish restarts the server: tell IndexNow about pages that are new or changed since the last one.
if (production && indexNow && process.env.DATABASE_URL && process.env.INDEXNOW_AUTO !== "off") {
  setTimeout(() => {
    submitChanged(indexNow, submissions)
      .then(r => console.log(`IndexNow: ${r.submitted} of ${r.pending} changed URLs submitted${r.failed.length ? `; rejected with ${r.failed.join(", ")}` : ""}`))
      .catch(error => console.error("IndexNow: submission skipped:", (error as Error).message));
  }, 30_000).unref();
}
