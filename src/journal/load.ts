/** Node-only: read and validate every article in content/journal/ (build and tests). */
import { readdirSync, readFileSync } from "node:fs";
import { parseArticle, validateJournal, type Article } from "./content.ts";
import { ORDERED_SHOPS } from "../data/shops.ts";
import { isIndexableShop, shopPath } from "../data/indexation.ts";

export const JOURNAL_DIR = new URL("../../content/journal/", import.meta.url);
/** Only real generated shop documents may be linked, never invented profile slugs. */
export const JOURNAL_SITE_PATHS: ReadonlySet<string> = new Set([
  "/me/", ...ORDERED_SHOPS.filter(isIndexableShop).map(shopPath),
]);

export function loadJournal(dir: URL = JOURNAL_DIR): Article[] {
  const files = readdirSync(dir).filter(name => name.endsWith(".md") && name !== "README.md").sort();
  const articles = files.map(name => parseArticle(name.slice(0, -3), readFileSync(new URL(name, dir), "utf8")));
  const problems = validateJournal(articles, JOURNAL_SITE_PATHS);
  if (problems.length) throw new Error(`Journal content problems:\n- ${problems.join("\n- ")}`);
  return articles;
}
