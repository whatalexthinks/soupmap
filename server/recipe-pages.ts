/**
 * Prerendered recipe pages, served with their real reader rating.
 *
 * Ratings live in Postgres and change after a build, so the static page leaves them out.
 * When a recipe has at least one published star rating, this adds schema.org
 * aggregateRating to its Recipe data and the same figures to the visible summary under
 * the title (Google only accepts ratings people can see). No ratings, no rating: nothing
 * is ever estimated. If the database can't be reached, the page is served as built.
 */
import type { RequestHandler } from "express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface Rating { average: number; count: number }
export interface RatingSource { ratings(): Promise<Record<string, Rating>> }

const SCHEMA = /<script type="application\/ld\+json" data-recipe-schema>([\s\S]*?)<\/script>/;
const SUMMARY = '<p class="r-rating-summary" id="r-rating-summary"></p>';

/** The page with its rating in place, or unchanged when there's nothing to add. */
export function withRating(html: string, rating: Rating | undefined): string {
  if (!rating?.count) return html;
  const match = html.match(SCHEMA);
  if (!match) return html;
  const data = JSON.parse(match[1]!) as Record<string, unknown>;
  const value = Math.round(rating.average * 10) / 10;
  data.aggregateRating = { "@type": "AggregateRating", ratingValue: value, ratingCount: rating.count, bestRating: 5, worstRating: 1 };
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  const stars = "★★★★★".slice(0, Math.round(value)) + "☆☆☆☆☆".slice(0, 5 - Math.round(value));
  const visible = `<p class="r-rating-summary" id="r-rating-summary"><a href="#reviews"><span class="r-stars" aria-hidden="true">${stars}</span> <strong>${value.toFixed(1)}</strong> · ${rating.count} ${rating.count === 1 ? "rating" : "ratings"}</a></p>`;
  return html.replace(match[0], `<script type="application/ld+json" data-recipe-schema>${json}</script>`).replace(SUMMARY, visible);
}

export function recipePagesWithRatings(source: RatingSource, dist = resolve("dist"), ttlMs = 5 * 60_000): RequestHandler {
  const pages = new Map<string, Promise<string | null>>();
  let ratings: { at: number; value: Promise<Record<string, Rating> | null> } | null = null;
  const currentRatings = () => {
    if (!ratings || Date.now() - ratings.at > ttlMs) {
      ratings = { at: Date.now(), value: source.ratings().catch(error => {
        console.error("Recipe ratings unavailable:", (error as Error).name);
        ratings = null;
        return null;
      }) };
    }
    return ratings.value;
  };
  return async (req, res, next) => {
    const slug = (req.method === "GET" || req.method === "HEAD") && /^\/recipes\/([a-z0-9-]{1,120})\/$/.exec(req.path)?.[1];
    if (!slug) { next(); return; }
    if (!pages.has(slug)) pages.set(slug, readFile(resolve(dist, "recipes", slug, "index.html"), "utf8").catch(() => null));
    const html = await pages.get(slug)!;
    // Browse pages and anything else under /recipes/ have no Recipe schema: leave them to the static server.
    if (!html || !SCHEMA.test(html)) { next(); return; }
    const all = await currentRatings();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.send(withRating(html, all?.[slug]));
  };
}
