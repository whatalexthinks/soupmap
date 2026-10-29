/**
 * Editorial introductions for city guides: content/guides/<style>-in-<city>.md.
 *
 * A guide's list comes from data; its intro is what a person needs before going: what the
 * local style is, where the bowls cluster, how ordering works. Written in our own words,
 * factual, no invented visits (content/guides/README.md).
 */
import { countWords, LINK, normalizeHref, parseFrontmatter, SLUG } from "../journal/content.ts";

export interface GuideIntro {
  /** Guide slug, e.g. "miso-ramen-in-sapporo". */
  slug: string;
  /** One sentence for the hero and the search description. */
  dek: string;
  updated: string;
  /** Markdown paragraphs. */
  body: string;
  /** "Know before you go" bullets (Markdown). */
  tips: string[];
}

export class GuideIntroError extends Error {
  constructor(slug: string, message: string) { super(`content/guides/${slug}.md: ${message}`); }
}

const FIELDS = new Set(["dek", "updated"]);
const TIPS = "Know before you go";

export function parseGuideIntro(slug: string, source: string): GuideIntro {
  if (!SLUG.test(slug) || !/-in-/.test(slug)) throw new GuideIntroError(slug, "file name must be <style>-in-<city>.md, like the guide's URL");
  const { data, body } = parseFrontmatter(slug, source);
  for (const key of Object.keys(data)) if (!FIELDS.has(key)) throw new GuideIntroError(slug, `unknown field "${key}"`);
  const dek = typeof data.dek === "string" ? data.dek.trim() : "";
  if (dek.length < 60 || dek.length > 200) throw new GuideIntroError(slug, `dek must be 60–200 characters (has ${dek.length})`);
  const updated = typeof data.updated === "string" ? data.updated : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated) || Number.isNaN(Date.parse(`${updated}T00:00:00Z`))) throw new GuideIntroError(slug, "updated must be YYYY-MM-DD");
  if (/^#\s/m.test(body)) throw new GuideIntroError(slug, "the guide has its own title; use ## only for \"Know before you go\"");
  const [text, ...sections] = body.split(/^##\s+/m);
  const tips: string[] = [];
  for (const section of sections) {
    const [heading, ...lines] = section.split("\n");
    if (heading!.trim() !== TIPS) throw new GuideIntroError(slug, `the only section is "## ${TIPS}" (found "## ${heading!.trim()}")`);
    for (const line of lines.map(l => l.trim()).filter(Boolean)) {
      if (!/^[-*]\s+/.test(line)) throw new GuideIntroError(slug, `"## ${TIPS}" takes bullets only`);
      tips.push(line.replace(/^[-*]\s+/, ""));
    }
  }
  if (tips.length > 4) throw new GuideIntroError(slug, `"## ${TIPS}" takes up to 4 bullets (has ${tips.length})`);
  const words = countWords(text!);
  if (words < 100 || words > 300) throw new GuideIntroError(slug, `intro should be 120–260 words (has ${words})`);
  if (/\b(?:best(?![- ]known)|top-rated|top rated|must-try)\b/i.test(`${dek} ${text}`)) throw new GuideIntroError(slug, "guides list places, they don't rank them: avoid \"best\", \"top rated\" and \"must-try\"");
  return { slug, dek, updated, body: text!.trim(), tips };
}

/**
 * Links in intros may point at recipes, journal essays, guides and the catalog. `paths`
 * holds every page the build publishes; anything else is a broken link.
 */
export function validateGuideIntros(intros: readonly GuideIntro[], guideSlugs: ReadonlySet<string>, paths: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const intro of intros) {
    if (!guideSlugs.has(intro.slug)) problems.push(`${intro.slug}: no guide at /guides/${intro.slug}/ (renamed, or too few places now)`);
    for (const [, , raw] of `${intro.body}\n${intro.tips.join("\n")}`.matchAll(LINK)) {
      const href = normalizeHref(raw!);
      if (/^https:\/\//.test(href)) continue;
      if (!paths.has(href.replace(/#.*$/, ""))) problems.push(`${intro.slug}: link to missing page ${href}`);
    }
  }
  return problems;
}
