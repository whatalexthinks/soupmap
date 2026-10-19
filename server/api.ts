import { Router, type Request } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { shopBySlug } from "../src/data/shops.ts";
import { getClerkProxyHost } from "./middlewares/clerkProxyMiddleware.ts";
import { ListStore } from "./lists.ts";

const uuid = z.uuid();
const name = z.object({name: z.string().trim().min(1).max(80)}).strict();
const items = z.object({ids: z.array(z.string().max(160).regex(/^[a-z0-9][a-z0-9-]*$/)).max(1000),
  add: z.boolean().default(true)}).strict().refine(value=>!value.add||value.ids.every(id=>shopBySlug.has(id)));

/** Resolver injection is for tests; the actual server always uses Clerk getAuth. */
export function personalApi(store: ListStore, userId: (req: Request) => string | null = req => getAuth(req).userId) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Cookie");
    const owner = userId(req);
    if (!owner) { res.status(401).json({error: "Sign in to access your lists."}); return; }
    res.locals.owner = owner;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      let sameOrigin = true;
      try { sameOrigin = !origin || new URL(origin).host === getClerkProxyHost(req); } catch { sameOrigin = false; }
      if (!sameOrigin || req.get("sec-fetch-site") === "cross-site") {
        res.status(403).json({error: "Cross-site requests are not allowed."}); return;
      }
      if (!req.is("application/json")) { res.status(415).json({error:"Use application/json."}); return; }
    }
    next();
  });
  router.get("/me", async (_req, res) => { res.json({lists: await store.all(res.locals.owner)}); });
  router.post("/lists", async (req, res) => {
    const parsed = name.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({error:"Use a list name between 1 and 80 characters."}); return; }
    const list = await store.create(res.locals.owner, parsed.data.name);
    if (!list) { res.status(409).json({error:"You can create up to 30 lists."}); return; }
    res.status(201).json({list});
  });
  router.patch("/lists/:id", async (req, res) => {
    const parsed = name.safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) { res.status(400).json({error:"Invalid list or name."}); return; }
    if (!await store.rename(res.locals.owner, req.params.id as string, parsed.data.name)) {
      res.status(404).json({error:"List not found."}); return;
    }
    res.json({ok:true});
  });
  router.delete("/lists/:id", async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) { res.status(400).json({error:"Invalid list."}); return; }
    if (!await store.remove(res.locals.owner, req.params.id as string)) { res.status(404).json({error:"List not found."}); return; }
    res.json({ok:true});
  });
  router.put("/lists/:id/items", async (req, res) => {
    const parsed = items.safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) { res.status(400).json({error:"Choose valid shops (up to 1,000 per list)."}); return; }
    if (!await store.setItems(res.locals.owner, req.params.id as string, parsed.data.ids, parsed.data.add)) {
      res.status(404).json({error:"List not found."}); return;
    }
    res.json({ok:true});
  });
  router.post("/import-saves", async (req, res) => {
    const parsed = items.safeParse(req.body);
    if (!parsed.success || !parsed.data.add) { res.status(400).json({error:"Choose valid saved shops to import."}); return; }
    const id = await store.savedList(res.locals.owner);
    await store.setItems(res.locals.owner, id, parsed.data.ids, true);
    res.json({ok:true});
  });
  router.put("/saved/:slug", async (req, res) => {
    const parsed = z.object({saved:z.boolean()}).strict().safeParse(req.body);
    if (!parsed.success || !shopBySlug.has(req.params.slug as string)) { res.status(400).json({error:"Invalid saved place."}); return; }
    const id = await store.savedList(res.locals.owner);
    await store.setItems(res.locals.owner, id, [req.params.slug as string], parsed.data.saved);
    res.json({ok:true});
  });
  return router;
}
