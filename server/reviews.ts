import { randomUUID } from "node:crypto";
import { Pool } from "pg";

export const TIP_KINDS = ["swap", "technique", "make-ahead", "serving", "other"] as const;
export const REPORT_REASONS = ["spam", "offensive", "unsafe", "off-topic", "other"] as const;
export type TipKind = typeof TIP_KINDS[number];
export type ReportReason = typeof REPORT_REASONS[number];
/** Distinct reports that hide an entry until a moderator looks at it. */
export const HIDE_AFTER_REPORTS = 3;

export interface ReviewInput {
  name: string;
  rating: number | null;
  body: string;
  madeIt: boolean;
  tip: string;
  tipKind: TipKind | null;
}

export interface Review {
  id: string;
  name: string;
  rating: number | null;
  body: string;
  madeIt: boolean;
  tip: string;
  tipKind: TipKind | null;
  created: string;
  updated: string;
  status: "published" | "hidden";
  helpful: number;
  /** The viewer wrote it. */
  mine: boolean;
  /** The viewer marked it helpful. */
  voted: boolean;
  reports?: number;
  recipe?: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
  /** Ratings of 1 to 5 stars, in that order. */
  stars: [number, number, number, number, number];
  madeIt: number;
  tips: number;
}

export type ReviewSort = "recent" | "helpful" | "highest" | "lowest";

const COLUMNS = `r.id, r.display_name AS name, r.rating, r.body, r.made_it AS "madeIt", r.tip, r.tip_kind AS "tipKind",
  r.created_at AS created, r.updated_at AS updated, r.status,
  (SELECT count(*)::int FROM recipe_review_votes v WHERE v.review_id = r.id) AS helpful,
  COALESCE(r.owner_id = $2::text, false) AS mine,
  EXISTS(SELECT 1 FROM recipe_review_votes v WHERE v.review_id = r.id AND v.voter_id = $2::text) AS voted`;
const ORDER: Record<ReviewSort, string> = {
  recent: "r.created_at DESC",
  helpful: "helpful DESC, r.created_at DESC",
  highest: "r.rating DESC NULLS LAST, r.created_at DESC",
  lowest: "r.rating ASC NULLS LAST, r.created_at DESC",
};

const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
function row(value: Record<string, unknown>): Review {
  return { ...value, created: iso(value.created), updated: iso(value.updated) } as Review;
}

export class ReviewStore {
  constructor(private readonly db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 })) {}

  /** Average and count for every recipe with published ratings. */
  async ratings(): Promise<Record<string, { average: number; count: number }>> {
    const result = await this.db.query(`SELECT recipe_slug AS slug, count(rating)::int AS count, round(avg(rating)::numeric, 2)::float AS average
      FROM recipe_reviews WHERE status = 'published' AND rating IS NOT NULL GROUP BY recipe_slug`);
    return Object.fromEntries(result.rows.map(r => [r.slug, { average: r.average, count: r.count }]));
  }

  async summary(recipe: string): Promise<RatingSummary> {
    const result = await this.db.query(`SELECT count(rating)::int AS count, round(avg(rating)::numeric, 2)::float AS average,
      count(*) FILTER (WHERE made_it)::int AS "madeIt", count(*) FILTER (WHERE tip <> '')::int AS tips,
      ARRAY[count(*) FILTER (WHERE rating = 1), count(*) FILTER (WHERE rating = 2), count(*) FILTER (WHERE rating = 3),
            count(*) FILTER (WHERE rating = 4), count(*) FILTER (WHERE rating = 5)]::int[] AS stars
      FROM recipe_reviews WHERE recipe_slug = $1 AND status = 'published'`, [recipe]);
    const r = result.rows[0];
    return { average: r.count ? r.average : null, count: r.count, stars: r.stars, madeIt: r.madeIt, tips: r.tips };
  }

  /** Published entries, plus the viewer's own even while hidden; moderators see everything. */
  async list(recipe: string, viewer: string | null, sort: ReviewSort, moderator = false): Promise<Review[]> {
    const result = await this.db.query(`SELECT ${COLUMNS}${moderator ? `, (SELECT count(*)::int FROM recipe_review_reports p WHERE p.review_id = r.id) AS reports` : ""}
      FROM recipe_reviews r WHERE r.recipe_slug = $1 AND (r.status = 'published' OR r.owner_id = $2::text OR $3)
      ORDER BY ${ORDER[sort]} LIMIT 200`, [recipe, viewer, moderator]);
    return result.rows.map(row);
  }

  /** Create or replace the owner's entry for a recipe. Editing keeps its helpful votes. */
  async upsert(recipe: string, owner: string, input: ReviewInput): Promise<Review> {
    const result = await this.db.query(`INSERT INTO recipe_reviews(id, recipe_slug, owner_id, display_name, rating, body, made_it, tip, tip_kind)
      VALUES ($3, $1, $2, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (recipe_slug, owner_id) DO UPDATE SET display_name = EXCLUDED.display_name, rating = EXCLUDED.rating,
        body = EXCLUDED.body, made_it = EXCLUDED.made_it, tip = EXCLUDED.tip, tip_kind = EXCLUDED.tip_kind, updated_at = now()
      RETURNING id`, [recipe, owner, randomUUID(), input.name, input.rating, input.body, input.madeIt, input.tip, input.tipKind]);
    const saved = await this.db.query(`SELECT ${COLUMNS} FROM recipe_reviews r WHERE r.id = $1`, [result.rows[0].id, owner]);
    return row(saved.rows[0]);
  }

  async remove(recipe: string, owner: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM recipe_reviews WHERE recipe_slug = $1 AND owner_id = $2", [recipe, owner]);
    return !!result.rowCount;
  }

  /** "missing" for unknown or hidden entries; "own" for your own (no self-votes). */
  async vote(id: string, voter: string, helpful: boolean): Promise<"ok" | "missing" | "own"> {
    const target = await this.db.query("SELECT owner_id FROM recipe_reviews WHERE id = $1 AND status = 'published'", [id]);
    if (!target.rowCount) return "missing";
    if (target.rows[0].owner_id === voter) return "own";
    await this.db.query(helpful
      ? "INSERT INTO recipe_review_votes(review_id, voter_id) VALUES ($1, $2) ON CONFLICT DO NOTHING"
      : "DELETE FROM recipe_review_votes WHERE review_id = $1 AND voter_id = $2", [id, voter]);
    return "ok";
  }

  /** One report per person per entry; enough distinct reports hide it for review. */
  async report(id: string, reporter: string, reason: ReportReason): Promise<"ok" | "missing" | "own"> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const target = await client.query("SELECT owner_id FROM recipe_reviews WHERE id = $1 FOR UPDATE", [id]);
      if (!target.rowCount) { await client.query("ROLLBACK"); return "missing"; }
      if (target.rows[0].owner_id === reporter) { await client.query("ROLLBACK"); return "own"; }
      await client.query("INSERT INTO recipe_review_reports(review_id, reporter_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [id, reporter, reason]);
      await client.query(`UPDATE recipe_reviews SET status = 'hidden'
        WHERE id = $1 AND status = 'published' AND (SELECT count(*) FROM recipe_review_reports WHERE review_id = $1) >= $2`, [id, HIDE_AFTER_REPORTS]);
      await client.query("COMMIT");
      return "ok";
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  /** Reported or hidden entries, newest first. */
  async queue(): Promise<Review[]> {
    // No viewer here: $1 stands in for the viewer column COLUMNS expects.
    const result = await this.db.query(`SELECT ${COLUMNS.replaceAll("$2::text", "$1::text")}, r.recipe_slug AS recipe,
      (SELECT count(*)::int FROM recipe_review_reports p WHERE p.review_id = r.id) AS reports
      FROM recipe_reviews r WHERE r.status = 'hidden' OR EXISTS(SELECT 1 FROM recipe_review_reports p WHERE p.review_id = r.id)
      ORDER BY r.updated_at DESC LIMIT 200`, [null]);
    return result.rows.map(row);
  }

  /** Publishing clears the reports, so the same reports can't hide it again. */
  async moderate(id: string, status: "published" | "hidden"): Promise<boolean> {
    const result = await this.db.query("UPDATE recipe_reviews SET status = $2 WHERE id = $1", [id, status]);
    if (status === "published" && result.rowCount) await this.db.query("DELETE FROM recipe_review_reports WHERE review_id = $1", [id]);
    return !!result.rowCount;
  }
}
