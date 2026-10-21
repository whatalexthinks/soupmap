import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { z } from "zod";
import { getClerkProxyHost } from "./middlewares/clerkProxyMiddleware.ts";
import { REPORT_REASONS, TIP_KINDS, type ReviewSort, type ReviewStore } from "./reviews.ts";

const LINKS = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|jp|ly|me)\b)/i;
const text = (max: number) => z.string().max(max * 2).transform(s => s.trim()).pipe(z.string().max(max));
const ReviewBody = z.object({
  name: z.string().max(80).transform(s => s.trim() || "Home cook").pipe(z.string().max(40)).default("Home cook"),
  rating: z.number().int().min(1).max(5).nullable().default(null),
  body: text(2000).default(""),
  madeIt: z.boolean().default(false),
  tip: text(500).default(""),
  tipKind: z.enum(TIP_KINDS).nullable().default(null),
}).strict()
  .refine(r => r.rating !== null || r.tip !== "", { message: "Add a star rating, a tip, or both." })
  .refine(r => (r.tip === "") === (r.tipKind === null), { message: "Choose what kind of tip it is." });
const uuid = z.uuid();
const SORTS = new Set<ReviewSort>(["recent", "helpful", "highest", "lowest"]);

interface Options {
  /** Resolver injection is for tests; the real server uses Clerk's getAuth. */
  userId?: (req: Request) => string | null;
  /** Clerk user ids allowed to hide and restore entries (RECIPE_MODERATORS, comma-separated). */
  moderators?: ReadonlySet<string>;
  /** Writes per account per hour. */
  hourlyWrites?: number;
}

/**
 * Public reads and signed-in writes for recipe reviews and tips, mounted at /api/recipes
 * before the account-only API. Unknown recipes are refused; a missing database or table
 * answers 503 so the page can say reviews are unavailable instead of failing.
 */
export function recipesApi(store: ReviewStore, recipes: ReadonlySet<string>, options: Options = {}) {
  const userId = options.userId ?? (req => getAuth(req).userId);
  const moderators = options.moderators ?? new Set((process.env.RECIPE_MODERATORS ?? "").split(",").map(s => s.trim()).filter(Boolean));
  const limit = options.hourlyWrites ?? 30;
  const writes = new Map<string, number[]>();
  const router = Router();

  const fail = (res: Response, status: number, error: string) => { res.status(status).json({ error }); };
  const viewer = (req: Request) => { try { return userId(req); } catch { return null; } };

  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Cookie");
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
    const owner = viewer(req);
    if (!owner) { fail(res, 401, "Sign in to leave a review or a tip."); return; }
    const origin = req.get("origin");
    let sameOrigin = true;
    try { sameOrigin = !origin || new URL(origin).host === getClerkProxyHost(req); } catch { sameOrigin = false; }
    if (!sameOrigin || req.get("sec-fetch-site") === "cross-site") { fail(res, 403, "Cross-site requests are not allowed."); return; }
    if (!req.is("application/json")) { fail(res, 415, "Use application/json."); return; }
    const now = Date.now();
    const recent = (writes.get(owner) ?? []).filter(t => now - t < 3_600_000);
    if (recent.length >= limit) { fail(res, 429, "That's a lot of activity for one hour. Please try again a little later."); return; }
    recent.push(now);
    writes.set(owner, recent);
    if (writes.size > 10_000) for (const [key, times] of writes) if (!times.some(t => now - t < 3_600_000)) writes.delete(key);
    res.locals.owner = owner;
    next();
  });

  const recipe = (req: Request, res: Response): string | null => {
    const slug = String(req.params.slug ?? "");
    if (!recipes.has(slug)) { fail(res, 404, "Unknown recipe."); return null; }
    return slug;
  };

  router.get("/ratings", async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({ ratings: await store.ratings() });
  });

  router.get("/:slug/reviews", async (req, res) => {
    const slug = recipe(req, res); if (!slug) return;
    const who = viewer(req);
    const moderator = !!who && moderators.has(who);
    const sort = SORTS.has(req.query.sort as ReviewSort) ? req.query.sort as ReviewSort : "helpful";
    const [summary, reviews] = await Promise.all([store.summary(slug), store.list(slug, who, sort, moderator)]);
    res.json({ summary, reviews, viewer: { signedIn: !!who, moderator } });
  });

  router.put("/:slug/review", async (req, res) => {
    const slug = recipe(req, res); if (!slug) return;
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, parsed.error.issues[0]?.message.startsWith("Add") || parsed.error.issues[0]?.message.startsWith("Choose")
      ? parsed.error.issues[0]!.message : "Check your review: a name up to 40 characters, a review up to 2,000 and a tip up to 500."); return; }
    const input = parsed.data;
    if ([input.name, input.body, input.tip].some(value => LINKS.test(value))) { fail(res, 400, "Links aren't allowed in reviews or tips."); return; }
    res.json({ review: await store.upsert(slug, res.locals.owner, input) });
  });

  router.delete("/:slug/review", async (req, res) => {
    const slug = recipe(req, res); if (!slug) return;
    if (!await store.remove(slug, res.locals.owner)) { fail(res, 404, "You haven't reviewed this recipe."); return; }
    res.json({ ok: true });
  });

  router.post("/reviews/:id/helpful", async (req, res) => {
    const parsed = z.object({ helpful: z.boolean() }).strict().safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) { fail(res, 400, "Invalid vote."); return; }
    const result = await store.vote(req.params.id as string, res.locals.owner, parsed.data.helpful);
    if (result === "missing") { fail(res, 404, "That review isn't available."); return; }
    if (result === "own") { fail(res, 400, "You can't vote for your own review."); return; }
    res.json({ ok: true });
  });

  router.post("/reviews/:id/report", async (req, res) => {
    const parsed = z.object({ reason: z.enum(REPORT_REASONS) }).strict().safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) { fail(res, 400, "Choose a reason for the report."); return; }
    const result = await store.report(req.params.id as string, res.locals.owner, parsed.data.reason);
    if (result === "missing") { fail(res, 404, "That review isn't available."); return; }
    if (result === "own") { fail(res, 400, "You can delete your own review instead."); return; }
    res.json({ ok: true });
  });

  router.get("/moderation", async (req, res) => {
    const who = viewer(req);
    if (!who || !moderators.has(who)) { fail(res, 403, "Moderator access required."); return; }
    res.json({ reviews: await store.queue() });
  });

  router.post("/reviews/:id/moderate", async (req, res) => {
    if (!moderators.has(res.locals.owner)) { fail(res, 403, "Moderator access required."); return; }
    const parsed = z.object({ status: z.enum(["published", "hidden"]) }).strict().safeParse(req.body);
    if (!uuid.safeParse(req.params.id).success || !parsed.success) { fail(res, 400, "Invalid moderation."); return; }
    if (!await store.moderate(req.params.id as string, parsed.data.status)) { fail(res, 404, "That review no longer exists."); return; }
    res.json({ ok: true });
  });

  // No database (static hosting, missing DATABASE_URL) or the migration hasn't run yet.
  router.use((error: Error & { code?: string }, _req: Request, res: Response, next: (error?: unknown) => void) => {
    if (res.headersSent) { next(error); return; }
    const unavailable = ["ECONNREFUSED", "ENOTFOUND", "42P01", "28P01", "3D000"].includes(error.code ?? "") || /DATABASE_URL|connect/i.test(error.message);
    if (!unavailable) console.error("Recipe reviews request failed:", error.name, error.code ?? "");
    fail(res, 503, "Reviews are taking a break. The recipe is all here; please try again later.");
  });
  return router;
}
