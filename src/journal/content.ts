/**
 * The Soup Journal: article model, frontmatter parsing and validation.
 * Articles are Markdown files in content/journal/ (see its README for the writing guide).
 * Pure functions only; the build reads the files and calls parseArticle().
 */

export interface JournalCategory {
  id: string;
  name: string;
  /** Vertical decorative mark, correct Japanese. */
  mark: string;
  description: string;
}

export const JOURNAL_CATEGORIES: readonly JournalCategory[] = [
  { id: "ramen", name: "Ramen Styles", mark: "拉麺",
    description: "Regional bowls, broths and the shops that shaped them, from Sapporo miso to Hakata tonkotsu." },
  { id: "noodles", name: "Noodles", mark: "麺",
    description: "Udon, soba, somen and the rest of Japan's noodle family." },
  { id: "japanese-soups", name: "Japanese Soups", mark: "汁物",
    description: "Miso soup, oden, ozōni and the quieter bowls of everyday Japanese cooking." },
  { id: "craft", name: "Craft & Ingredients", mark: "素材",
    description: "Dashi, kombu, katsuobushi, noodles and toppings: what goes into the bowl, and why." },
  { id: "history", name: "History & Culture", mark: "歴史",
    description: "How noodles came to Japan, how instant ramen happened, and how umami got its name." },
  { id: "travel", name: "Travel & Etiquette", mark: "旅",
    description: "Ticket machines, slurping, solo counters and street stalls: eating well in Japan." },
  { id: "world", name: "Soups of the World", mark: "世界",
    description: "Phở, laksa, borscht, gumbo and the great soups beyond Japan." },
];

export const categoryById: ReadonlyMap<string, JournalCategory> = new Map(JOURNAL_CATEGORIES.map(c => [c.id, c]));

export interface GlanceItem {
  label: string;
  value: string;
}

export interface Article {
  slug: string;
  title: string;
  dek: string;
  category: string;
  mark: string;
  date: string;
  map?: string;
  mapLabel?: string;
  glance: GlanceItem[];
  further: string[];
  related: string[];
  /** Markdown body. */
  body: string;
  words: number;
  readingMinutes: number;
}

export class JournalError extends Error {
  constructor(slug: string, message: string) {
    super(`content/journal/${slug}.md: ${message}`);
  }
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
/** Map links the app understands: a search on /map/, or one of the static city directories. */
export const MAP_LINK = /^\/(?:map\/\?q=[a-z0-9%-]+(?:\+[a-z0-9%-]+)*|city\/[a-z]+\/)$/;

/**
 * Writers may type "/?q=okinawa soba" (the guide's short form); the map lives at /map/
 * and URLs need "+" for the space.
 */
export function normalizeHref(href: string): string {
  const value = href.trim();
  const search = value.match(/^\/(?:map\/)?\?q=(.*)$/);
  return search ? `/map/?q=${search[1]!.trim().toLowerCase().replace(/\s+/g, "+")}` : value;
}

type Frontmatter = Record<string, string | string[]>;

/** The small YAML subset the guide documents: `key: value` and `key:` + `  - item` lists. */
export function parseFrontmatter(slug: string, source: string): { data: Frontmatter; body: string } {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new JournalError(slug, "missing --- frontmatter block");
  const data: Frontmatter = {};
  let list: string[] | null = null;
  for (const raw of match[1]!.split("\n")) {
    if (!raw.trim()) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item) {
      if (!list) throw new JournalError(slug, `list item without a key: "${raw.trim()}"`);
      list.push(unquote(item[1]!.trim()));
      continue;
    }
    const field = raw.match(/^([a-zA-Z]+):(?:\s+(.*))?$/);
    if (!field) throw new JournalError(slug, `unreadable frontmatter line: "${raw}"`);
    const [, key, value] = field as unknown as [string, string, string | undefined];
    if (key in data) throw new JournalError(slug, `duplicate field "${key}"`);
    if (value === undefined || value.trim() === "") {
      list = [];
      data[key] = list;
    } else {
      list = null;
      data[key] = unquote(value.trim());
    }
  }
  return { data, body: match[2]!.trim() };
}

function unquote(value: string): string {
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

/** [text](href); href may contain spaces in map searches. */
export const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;

export function countWords(markdown: string): number {
  const text = markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*_`-]/g, " ");
  const latin = text.match(/[A-Za-z0-9À-ɏ'’]+/g)?.length ?? 0;
  // Japanese has no spaces; count roughly two characters per word.
  const cjk = text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  return latin + Math.ceil(cjk / 2);
}

export function parseArticle(slug: string, source: string): Article {
  if (!SLUG.test(slug)) throw new JournalError(slug, "file name must be lowercase-kebab-case");
  const { data, body } = parseFrontmatter(slug, source);
  const text = (key: string, required = true): string | undefined => {
    const value = data[key];
    if (value === undefined) {
      if (required) throw new JournalError(slug, `missing "${key}"`);
      return undefined;
    }
    if (typeof value !== "string" || !value.trim()) throw new JournalError(slug, `"${key}" must be a single line of text`);
    return value;
  };
  const list = (key: string, min: number, max: number): string[] => {
    const value = data[key] ?? [];
    if (!Array.isArray(value)) throw new JournalError(slug, `"${key}" must be a list`);
    if (value.length < min || value.length > max) throw new JournalError(slug, `"${key}" needs ${min}–${max} items`);
    return value;
  };
  const known = new Set(["title", "dek", "category", "mark", "date", "map", "mapLabel", "glance", "further", "related"]);
  for (const key of Object.keys(data)) if (!known.has(key)) throw new JournalError(slug, `unknown field "${key}"`);

  const title = text("title")!;
  const dek = text("dek")!;
  if (dek.length > 200) throw new JournalError(slug, "dek is longer than 200 characters");
  const category = text("category")!;
  if (!categoryById.has(category)) throw new JournalError(slug, `unknown category "${category}"`);
  const mark = text("mark")!;
  if (!JAPANESE.test(mark) || [...mark].length > 8) throw new JournalError(slug, "mark must be 1–8 Japanese characters");
  const date = text("date")!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new JournalError(slug, "date must be YYYY-MM-DD");
  const rawMap = text("map", false);
  const map = rawMap ? normalizeHref(rawMap) : undefined;
  const mapLabel = text("mapLabel", false);
  if (map && !MAP_LINK.test(map)) throw new JournalError(slug, `map must be /map/?q=<words> or /city/<slug>/, got "${map}"`);
  if (!!map !== !!mapLabel) throw new JournalError(slug, "map and mapLabel go together");
  const glance = list("glance", 3, 6).map(line => {
    const at = line.indexOf(":");
    if (at < 1) throw new JournalError(slug, `glance items look like "Label: fact", got "${line}"`);
    return { label: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
  });
  const further = list("further", 1, 5);
  const related = list("related", 0, 4);
  for (const other of related) if (!SLUG.test(other) || other === slug) throw new JournalError(slug, `bad related slug "${other}"`);
  if (!body) throw new JournalError(slug, "empty body");
  if (/^#\s/m.test(body)) throw new JournalError(slug, "use ## for headings; the title is the only h1");
  const words = countWords(body);
  return {
    slug, title, dek, category, mark, date, glance, further, related, body, words,
    readingMinutes: Math.max(2, Math.round(words / 220)),
    ...(map ? { map, mapLabel } : {}),
  };
}

/** Cross-article checks: related slugs and internal links must point at real pages. */
export function validateJournal(articles: readonly Article[], extraPaths: ReadonlySet<string> = new Set()): string[] {
  const slugs = new Set(articles.map(a => a.slug));
  const problems: string[] = [];
  for (const id of categoryById.keys()) if (slugs.has(id)) problems.push(`article slug "${id}" collides with a category`);
  for (const article of articles) {
    for (const other of article.related) if (!slugs.has(other)) problems.push(`${article.slug}: related "${other}" does not exist`);
    for (const [, , raw] of article.body.matchAll(LINK)) {
      const href = normalizeHref(raw!);
      if (/^https:\/\//.test(href)) continue;
      const journal = href.match(/^\/journal\/(topic\/)?([a-z0-9-]+)\/(?:#[a-z0-9-]+)?$/);
      if (journal) {
        const exists = journal[1] ? categoryById.has(journal[2]!) : slugs.has(journal[2]!);
        if (!exists) problems.push(`${article.slug}: link to missing page ${href}`);
      } else if (!MAP_LINK.test(href) && !["/catalog/", "/journal/", "/map/"].includes(href) && !extraPaths.has(href)) {
        problems.push(`${article.slug}: unsupported link ${href}`);
      }
    }
  }
  return problems;
}

/** Same category first, then the writer's picks, then everything else by recency. */
export function relatedArticles(article: Article, all: readonly Article[], count = 3): Article[] {
  const bySlug = new Map(all.map(a => [a.slug, a]));
  const picks = article.related.map(s => bySlug.get(s)).filter((a): a is Article => !!a);
  const sameCategory = all.filter(a => a.category === article.category && a.slug !== article.slug);
  const seen = new Set<string>([article.slug]);
  const out: Article[] = [];
  for (const candidate of [...picks, ...sameCategory, ...all]) {
    if (out.length >= count) break;
    if (seen.has(candidate.slug)) continue;
    seen.add(candidate.slug);
    out.push(candidate);
  }
  return out;
}
