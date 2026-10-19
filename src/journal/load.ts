/** Node-only: read and validate every article in content/journal/ (build and tests). */
import { readdirSync, readFileSync } from "node:fs";
import { parseArticle, validateJournal, type Article } from "./content.ts";

export const JOURNAL_DIR = new URL("../../content/journal/", import.meta.url);

export function loadJournal(dir: URL = JOURNAL_DIR): Article[] {
  const files = readdirSync(dir).filter(name => name.endsWith(".md") && name !== "README.md").sort();
  const articles = files.map(name => parseArticle(name.slice(0, -3), readFileSync(new URL(name, dir), "utf8")));
  const problems = validateJournal(articles);
  if (problems.length) throw new Error(`Journal content problems:\n- ${problems.join("\n- ")}`);
  return articles;
}
