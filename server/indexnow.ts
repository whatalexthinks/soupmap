/**
 * IndexNow: tell Bing, Yandex, Seznam, Naver and the services built on their indexes
 * which URLs are new or changed, instead of waiting for a crawl. Google doesn't use
 * IndexNow; it reads the sitemaps.
 *
 * - INDEXNOW_KEY: any 8–128 letters, digits or dashes. Served at /<key>.txt to prove the site is ours.
 * - On each production start (a Replit publish), URLs from the built sitemaps whose
 *   lastmod is new or changed since the last submission are sent, in batches of 10,000.
 *   Set INDEXNOW_AUTO=off to stop that.
 * - POST /api/indexnow with "Authorization: Bearer <INDEXNOW_ADMIN_TOKEN>" submits on demand:
 *   {"urls": [...]} for specific pages, or {} for everything changed.
 */
import express, { type RequestHandler, type Router } from "express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { Pool } from "pg";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_BATCH = 10_000;
const KEY = /^[a-zA-Z0-9-]{8,128}$/;

export interface IndexNowConfig { key: string; siteUrl: string; host: string; endpoint: string }

export function indexNowConfig(env: Record<string, string | undefined>): IndexNowConfig | undefined {
  const key = env.INDEXNOW_KEY?.trim();
  if (!key) return undefined;
  if (!KEY.test(key)) throw new Error("INDEXNOW_KEY must be 8–128 letters, digits or dashes");
  const siteUrl = (env.SITE_URL || env.VITE_SITE_URL || "https://soupmap.com").replace(/\/+$/, "");
  return { key, siteUrl, host: new URL(siteUrl).host, endpoint: env.INDEXNOW_ENDPOINT || INDEXNOW_ENDPOINT };
}

/** GET /<key>.txt: the verification file IndexNow fetches. */
export function keyFile(config: IndexNowConfig): RequestHandler {
  const path = `/${config.key}.txt`;
  return (req, res, next) => {
    if (req.path !== path || (req.method !== "GET" && req.method !== "HEAD")) { next(); return; }
    res.type("text/plain").send(config.key);
  };
}

export interface SitemapUrl { url: string; lastmod?: string }

/** Every <loc> (and <lastmod>) in the built sitemap index and its segments. */
export async function sitemapUrls(dist = resolve("dist")): Promise<SitemapUrl[]> {
  const index = await readFile(resolve(dist, "sitemap_index.xml"), "utf8");
  const files = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]!).pathname.slice(1));
  const out: SitemapUrl[] = [];
  for (const file of files) {
    if (!/^sitemap-[a-z]+(?:-\d+)?\.xml$/.test(file)) continue;
    const xml = await readFile(resolve(dist, file), "utf8");
    for (const m of xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)) {
      out.push({ url: m[1]!.replaceAll("&amp;", "&"), ...(m[2] ? { lastmod: m[2] } : {}) });
    }
  }
  return out;
}

/** POST the URLs in batches; IndexNow answers 200 or 202 when it accepts them. */
export async function submitUrls(urls: readonly string[], config: IndexNowConfig, fetchImpl: typeof fetch = fetch): Promise<{ accepted: string[]; failed: number[] }> {
  const accepted: string[] = [];
  const failed: number[] = [];
  for (let i = 0; i < urls.length; i += INDEXNOW_BATCH) {
    const batch = urls.slice(i, i + INDEXNOW_BATCH);
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: config.host, key: config.key, keyLocation: `${config.siteUrl}/${config.key}.txt`, urlList: batch }),
    });
    if (response.status === 200 || response.status === 202) accepted.push(...batch);
    else failed.push(response.status);
  }
  return { accepted, failed };
}

export interface SubmissionLog {
  /** URLs never sent, or sent with a different lastmod. */
  pending(urls: readonly SitemapUrl[]): Promise<SitemapUrl[]>;
  record(urls: readonly SitemapUrl[]): Promise<void>;
}

/** migrations/003_indexnow.sql */
export class PgSubmissionLog implements SubmissionLog {
  constructor(private readonly db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })) {}

  async pending(urls: readonly SitemapUrl[]): Promise<SitemapUrl[]> {
    const result = await this.db.query<{ url: string; lastmod: string }>("SELECT url, lastmod FROM indexnow_submissions");
    const sent = new Map(result.rows.map(row => [row.url, row.lastmod]));
    return urls.filter(u => !sent.has(u.url) || sent.get(u.url) !== (u.lastmod ?? ""));
  }

  async record(urls: readonly SitemapUrl[]): Promise<void> {
    for (let i = 0; i < urls.length; i += 1000) {
      const batch = urls.slice(i, i + 1000);
      await this.db.query(`INSERT INTO indexnow_submissions (url, lastmod, submitted_at)
        SELECT url, lastmod, now() FROM unnest($1::text[], $2::text[]) AS t(url, lastmod)
        ON CONFLICT (url) DO UPDATE SET lastmod = EXCLUDED.lastmod, submitted_at = EXCLUDED.submitted_at`,
      [batch.map(u => u.url), batch.map(u => u.lastmod ?? "")]);
    }
  }
}

/** Send whatever the sitemaps list that IndexNow hasn't heard about yet. */
export async function submitChanged(config: IndexNowConfig, log: SubmissionLog, dist = resolve("dist"), fetchImpl: typeof fetch = fetch): Promise<{ submitted: number; pending: number; failed: number[] }> {
  const pending = (await log.pending(await sitemapUrls(dist))).filter(u => new URL(u.url).host === config.host);
  if (!pending.length) return { submitted: 0, pending: 0, failed: [] };
  const { accepted, failed } = await submitUrls(pending.map(u => u.url), config, fetchImpl);
  const ok = new Set(accepted);
  await log.record(pending.filter(u => ok.has(u.url)));
  return { submitted: accepted.length, pending: pending.length, failed };
}

const sameToken = (given: string, expected: string) => {
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** POST /api/indexnow, for the site owner only. */
export function indexNowApi(config: IndexNowConfig | undefined, log: SubmissionLog, token: string | undefined, dist = resolve("dist"), fetchImpl: typeof fetch = fetch): Router {
  const router = express.Router();
  router.post("/", async (req, res) => {
    if (!config || !token || token.length < 24) { res.status(503).json({ error: "IndexNow isn't configured." }); return; }
    const given = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1] ?? "";
    if (!sameToken(given, token)) { res.status(401).json({ error: "Not allowed." }); return; }
    const urls: unknown = req.body?.urls;
    try {
      if (urls === undefined) { res.json(await submitChanged(config, log, dist, fetchImpl)); return; }
      if (!Array.isArray(urls) || !urls.length || urls.length > INDEXNOW_BATCH
        || urls.some(u => typeof u !== "string" || !URL.canParse(u) || new URL(u).host !== config.host)) {
        res.status(400).json({ error: `Send "urls": 1–${INDEXNOW_BATCH} absolute URLs on ${config.host}.` });
        return;
      }
      const result = await submitUrls(urls as string[], config, fetchImpl);
      res.json({ submitted: result.accepted.length, failed: result.failed });
    } catch (error) {
      console.error("IndexNow submission failed:", (error as Error).name);
      res.status(502).json({ error: "IndexNow submission failed." });
    }
  });
  return router;
}
