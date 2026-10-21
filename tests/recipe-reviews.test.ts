import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { Pool } from "pg";
import { recipesApi } from "../server/recipes-api.ts";
import { ReviewStore } from "../server/reviews.ts";

async function serve(store: ReviewStore, recipes: Set<string>, options: Parameters<typeof recipesApi>[2] = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api/recipes", recipesApi(store, recipes, { userId: req => req.get("x-test-owner") ?? null, ...options }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const port = (server.address() as { port: number }).port;
  const request = async (path: string, method = "GET", body?: unknown, owner: string | null = null, origin?: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/recipes${path}`, {
      method, headers: { "Content-Type": "application/json", ...(owner ? { "x-test-owner": owner } : {}), ...(origin ? { Origin: origin } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  };
  return { request, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test("reviews and tips: public reads, one entry per cook, votes, reports, moderation", { skip: !process.env.DATABASE_URL }, async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const slug = `test-soup-${randomUUID().slice(0, 8)}`;
  const [alice, bob, carol, dave, mod] = ["alice", "bob", "carol", "dave", "mod"].map(n => `test-${n}-${randomUUID()}`);
  const api = await serve(new ReviewStore(db), new Set([slug]), { moderators: new Set([mod!]) });
  try {
    // Writing needs an account; reading doesn't.
    assert.equal((await api.request(`/${slug}/review`, "PUT", { rating: 5 })).status, 401);
    const empty = await api.request(`/${slug}/reviews`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.data.summary, { average: null, count: 0, stars: [0, 0, 0, 0, 0], madeIt: 0, tips: 0 });
    assert.deepEqual(empty.data.viewer, { signedIn: false, moderator: false });

    const first = await api.request(`/${slug}/review`, "PUT", { name: "Aki", rating: 4, body: "Deep and clean.", madeIt: true,
      tip: "Use chicken feet for body.", tipKind: "swap" }, alice);
    assert.equal(first.status, 200);
    assert.equal(first.data.review.mine, true);
    // Posting again edits the same entry.
    const edited = await api.request(`/${slug}/review`, "PUT", { name: "Aki", rating: 5, body: "Even better the next day.", madeIt: true,
      tip: "Use chicken feet for body.", tipKind: "swap" }, alice);
    assert.equal(edited.data.review.id, first.data.review.id);
    assert.equal(edited.data.review.rating, 5);
    // A tip on its own is welcome; an empty entry isn't.
    assert.equal((await api.request(`/${slug}/review`, "PUT", { tip: "Skim early.", tipKind: "technique" }, bob)).data.review.rating, null);
    assert.equal((await api.request(`/${slug}/review`, "PUT", { body: "Nice" }, carol)).status, 400);
    assert.equal((await api.request(`/${slug}/review`, "PUT", { rating: 3, tip: "No kind" }, carol)).status, 400);
    assert.equal((await api.request(`/${slug}/review`, "PUT", { rating: 3, body: "see www.spam.example" }, carol)).status, 400);
    assert.equal((await api.request(`/${slug}/review`, "PUT", { rating: 9 }, carol)).status, 400);
    assert.equal((await api.request(`/not-a-recipe/review`, "PUT", { rating: 3 }, carol)).status, 404);
    assert.equal((await api.request(`/${slug}/review`, "PUT", { rating: 3 }, carol, "https://evil.example")).status, 403);
    assert.equal((await api.request(`/${slug}/review`, "PUT", { rating: 3, name: "" }, carol)).data.review.name, "Home cook");

    const summary = (await api.request(`/${slug}/reviews`)).data.summary;
    assert.deepEqual(summary, { average: 4, count: 2, stars: [0, 0, 1, 0, 1], madeIt: 1, tips: 2 });
    assert.deepEqual((await api.request("/ratings")).data.ratings[slug], { average: 4, count: 2 });

    // Helpful votes: not on your own entry; toggling works.
    const aliceId = first.data.review.id as string;
    assert.equal((await api.request(`/reviews/${aliceId}/helpful`, "POST", { helpful: true }, alice)).status, 400);
    assert.equal((await api.request(`/reviews/${aliceId}/helpful`, "POST", { helpful: true }, bob)).status, 200);
    assert.equal((await api.request(`/reviews/${aliceId}/helpful`, "POST", { helpful: true }, bob)).status, 200, "voting twice is harmless");
    const byHelpful = await api.request(`/${slug}/reviews?sort=helpful`, "GET", undefined, bob);
    assert.equal(byHelpful.data.reviews[0].id, aliceId);
    assert.equal(byHelpful.data.reviews[0].helpful, 1);
    assert.equal(byHelpful.data.reviews[0].voted, true);
    assert.equal(byHelpful.data.reviews.find((r: { mine: boolean }) => r.mine).tip, "Skim early.");

    // Three distinct reports hide an entry; the author still sees it, the public doesn't.
    for (const reporter of [bob, carol, carol, dave]) assert.equal((await api.request(`/reviews/${aliceId}/report`, "POST", { reason: "spam" }, reporter)).status, 200);
    assert.equal((await api.request(`/reviews/${aliceId}/report`, "POST", { reason: "spam" }, alice)).status, 400);
    assert.equal((await api.request(`/${slug}/reviews`)).data.reviews.some((r: { id: string }) => r.id === aliceId), false);
    assert.equal((await api.request(`/${slug}/reviews`, "GET", undefined, alice)).data.reviews.find((r: { id: string }) => r.id === aliceId).status, "hidden");
    assert.equal((await api.request(`/${slug}/reviews`)).data.summary.count, 1, "hidden ratings leave the average");
    assert.equal((await api.request(`/reviews/${aliceId}/helpful`, "POST", { helpful: true }, carol)).status, 404);

    // Moderators see the queue and can restore; restoring clears the reports.
    assert.equal((await api.request("/moderation", "GET", undefined, bob)).status, 403);
    const queue = await api.request("/moderation", "GET", undefined, mod);
    const queued = queue.data.reviews.find((r: { id: string }) => r.id === aliceId);
    assert.equal(queued.reports, 3);
    assert.equal(queued.recipe, slug);
    assert.equal((await api.request(`/reviews/${aliceId}/moderate`, "POST", { status: "published" }, bob)).status, 403);
    assert.equal((await api.request(`/reviews/${aliceId}/moderate`, "POST", { status: "published" }, mod)).status, 200);
    assert.equal((await api.request(`/${slug}/reviews`)).data.summary.count, 2);
    assert.equal((await api.request("/moderation", "GET", undefined, mod)).data.reviews.some((r: { id: string }) => r.id === aliceId), false);

    // Delete your own entry.
    assert.equal((await api.request(`/${slug}/review`, "DELETE", {}, alice)).status, 200);
    assert.equal((await api.request(`/${slug}/review`, "DELETE", {}, alice)).status, 404);
    assert.equal((await api.request(`/${slug}/reviews`)).data.summary.count, 1);
  } finally {
    // Close everything even if the database went away, so a failure fails instead of hanging.
    await db.query("DELETE FROM recipe_reviews WHERE recipe_slug = $1", [slug]).catch(() => undefined);
    await api.close();
    await db.end().catch(() => undefined);
  }
});

test("reviews degrade cleanly: no database answers 503, and writes are rate limited", async () => {
  const unreachable = new Pool({ connectionString: "postgres://nobody@127.0.0.1:9/none", connectionTimeoutMillis: 500 });
  const api = await serve(new ReviewStore(unreachable), new Set(["miso-soup"]), { hourlyWrites: 2 });
  try {
    const read = await api.request("/miso-soup/reviews");
    assert.equal(read.status, 503);
    assert.match(read.data.error, /taking a break/);
    assert.equal((await api.request("/ratings")).status, 503);
    // Validation happens before the database, so a bad entry is still a 400; the third write in an hour is a 429.
    assert.equal((await api.request("/miso-soup/review", "PUT", { body: "x" }, "someone")).status, 400);
    assert.equal((await api.request("/miso-soup/review", "PUT", { rating: 4 }, "someone")).status, 503);
    assert.equal((await api.request("/miso-soup/review", "PUT", { rating: 4 }, "someone")).status, 429);
    assert.equal((await api.request("/miso-soup/review", "PUT", { rating: 4 }, "someone-else")).status, 503, "limits are per account");
  } finally {
    await api.close();
    await unreachable.end().catch(() => undefined);
  }
});
