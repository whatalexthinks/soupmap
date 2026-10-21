/**
 * Recipe photos from Wikimedia Commons, with their licences checked and credits recorded.
 *
 *   npm run photos:recipes                 fetch every photo listed in content/recipes/photos.json
 *   npm run photos:recipes -- --suggest    list candidate photos for recipes that have none
 *   npm run photos:recipes -- --suggest --preview <dir> [slug…]   also save small previews to look at
 *
 * content/recipes/photos.json is chosen by a person: { "<slug>": { "file": "File:….jpg", "alt": "…" } }.
 * This script never picks a photo on its own. It refuses anything that isn't CC0, public domain,
 * CC BY or CC BY-SA, saves resized copies to public/images/recipes/, and writes the credits to
 * src/data/recipe-photos.json, which the recipe pages read. Behind a proxy, run Node with
 * NODE_USE_ENV_PROXY=1.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "SoupmapRecipePhotos/1.0 (https://soupmap.com/credits/)";
const MANIFEST = "content/recipes/photos.json";
const OUTPUT = "src/data/recipe-photos.json";
const IMAGE_DIR = "public/images/recipes";
export const FULL_WIDTH = 1600;
export const THUMB_WIDTH = 640;

export interface ManifestEntry { file: string; alt: string }
export interface PhotoCredit { src: string; thumb: string; width: number; height: number; alt: string; author: string; license: string; licenseUrl: string; source: string }
interface ImageInfo {
  url: string; thumburl?: string; thumbwidth?: number; thumbheight?: number; width: number; height: number; descriptionurl: string; mime: string;
  extmetadata?: Record<string, { value: string } | undefined>;
}

/** Free licences only: no NonCommercial, no NoDerivatives, no "fair use", no GFDL-only. */
export function allowedLicense(shortName: string): boolean {
  const name = shortName.trim();
  if (/\b(NC|ND)\b|non-?commercial|no ?deriv|fair use|GFDL$/i.test(name)) return false;
  return /^(CC0|Public domain|PD\b|PD-|CC BY(-SA)? \d(\.\d)?)/i.test(name);
}

/** Commons "Artist" is HTML; keep the words. */
export function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function commons(params: Record<string, string>, fetcher: typeof fetch): Promise<{ query?: { pages?: Record<string, { title: string; missing?: string; imageinfo?: ImageInfo[] }> } }> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ format: "json", formatversion: "1", ...params })) url.searchParams.set(key, value);
  const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`Commons API answered ${response.status} for ${params.titles ?? params.gsrsearch}`);
  return response.json() as Promise<never>;
}

const INFO = { prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|Credit|UsageTerms" };

/** Check one manifest entry and describe the photo we'd publish. */
export async function describe(slug: string, entry: ManifestEntry, fetcher: typeof fetch = fetch): Promise<{ credit: PhotoCredit; full: string; thumb: string }> {
  if (!/^File:.+\.(jpe?g|png|webp)$/i.test(entry.file)) throw new Error(`${slug}: "file" must be a Commons file title like "File:Shoyu ramen.jpg"`);
  if (!entry.alt?.trim() || entry.alt.length > 200) throw new Error(`${slug}: "alt" must describe the photo in up to 200 characters`);
  const data = await commons({ action: "query", titles: entry.file, ...INFO, iiurlwidth: String(FULL_WIDTH) }, fetcher);
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!page || page.missing !== undefined || !info) throw new Error(`${slug}: ${entry.file} was not found on Commons`);
  const meta = info.extmetadata ?? {};
  const license = plainText(meta.LicenseShortName?.value ?? "");
  if (!allowedLicense(license)) throw new Error(`${slug}: ${entry.file} is licensed "${license || "unknown"}", which we can't use`);
  const author = plainText(meta.Artist?.value ?? "") || plainText(meta.Credit?.value ?? "");
  if (!author && !/^(CC0|Public domain|PD)/i.test(license)) throw new Error(`${slug}: ${entry.file} has no author to credit`);
  const licenseUrl = meta.LicenseUrl?.value || (/^CC0/i.test(license) ? "https://creativecommons.org/publicdomain/zero/1.0/" : "https://commons.wikimedia.org/wiki/Commons:Licensing");
  if (info.width < 900) throw new Error(`${slug}: ${entry.file} is only ${info.width}px wide; choose one at least 900px wide`);
  const full = info.thumburl ?? info.url;
  const width = Math.min(info.thumbwidth ?? info.width, FULL_WIDTH);
  const height = Math.round(width * info.height / info.width);
  // Commons thumbnails share a URL pattern: /…/1600px-Name.jpg → /…/640px-Name.jpg.
  const thumb = full.includes(`/${FULL_WIDTH}px-`) ? full.replace(`/${FULL_WIDTH}px-`, `/${THUMB_WIDTH}px-`) : full;
  const ext = info.mime === "image/png" ? "png" : info.mime === "image/webp" ? "webp" : "jpg";
  return {
    full, thumb,
    credit: { src: `/images/recipes/${slug}.${ext}`, thumb: `/images/recipes/${slug}-${THUMB_WIDTH}.${ext}`, width, height,
      alt: entry.alt.trim(), author: author || "Public domain", license, licenseUrl: licenseUrl.replace(/^\/\//, "https://"), source: info.descriptionurl },
  };
}

async function download(url: string, path: string, fetcher: typeof fetch): Promise<void> {
  const response = await fetcher(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  writeFileSync(path, Buffer.from(await response.arrayBuffer()));
}

export async function fetchAll(fetcher: typeof fetch = fetch, root = "."): Promise<Record<string, PhotoCredit>> {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), "utf8")) as Record<string, ManifestEntry>;
  const slugs = new Set(readdirSync(join(root, "content/recipes")).filter(f => f.endsWith(".md") && f !== "README.md").map(f => f.slice(0, -3)));
  mkdirSync(join(root, IMAGE_DIR), { recursive: true });
  const credits: Record<string, PhotoCredit> = {};
  const problems: string[] = [];
  for (const [slug, entry] of Object.entries(manifest).sort()) {
    if (!slugs.has(slug)) { problems.push(`${slug}: no such recipe`); continue; }
    try {
      const { credit, full, thumb } = await describe(slug, entry, fetcher);
      await download(full, join(root, "public", credit.src), fetcher);
      await download(thumb, join(root, "public", credit.thumb), fetcher);
      credits[slug] = credit;
      console.log(`✓ ${slug}: ${credit.author}, ${credit.license}`);
    } catch (error) { problems.push(error instanceof Error ? error.message : String(error)); }
  }
  writeFileSync(join(root, OUTPUT), `${JSON.stringify(credits, null, 2)}\n`);
  if (problems.length) console.error(`\nNot published:\n- ${problems.join("\n- ")}`);
  return credits;
}

/** Candidate photos for a person to look at; nothing is published from here. */
async function suggest(slugs: string[], preview: string | null, fetcher: typeof fetch = fetch): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, ManifestEntry>;
  const titles = new Map(readdirSync("content/recipes").filter(f => f.endsWith(".md") && f !== "README.md").map(f => {
    const title = readFileSync(join("content/recipes", f), "utf8").match(/^title:\s*(.+)$/m)?.[1] ?? f;
    return [f.slice(0, -3), title.replace(/\(.*?\)/g, "").trim()] as const;
  }));
  const wanted = slugs.length ? slugs : [...titles.keys()].filter(s => !manifest[s]);
  if (preview) mkdirSync(preview, { recursive: true });
  for (const slug of wanted) {
    const data = await commons({ action: "query", generator: "search", gsrnamespace: "6", gsrlimit: "12",
      gsrsearch: `${titles.get(slug) ?? slug} filetype:bitmap`, ...INFO, iiurlwidth: "320" }, fetcher);
    const pages = Object.values(data.query?.pages ?? {}).filter(p => p.imageinfo?.[0]);
    console.log(`\n## ${slug} (${titles.get(slug)})`);
    let n = 0;
    for (const page of pages) {
      const info = page.imageinfo![0]!;
      const license = plainText(info.extmetadata?.LicenseShortName?.value ?? "");
      if (!allowedLicense(license) || info.width < 900) continue;
      n++;
      console.log(`  ${n}. "${page.title}" · ${info.width}×${info.height} · ${license} · ${plainText(info.extmetadata?.Artist?.value ?? "")}`);
      if (preview && info.thumburl) await download(info.thumburl, join(preview, `${slug}-${n}.jpg`), fetcher);
    }
    if (!n) console.log("  (no freely licensed candidates; try other words with --suggest and a custom search on commons.wikimedia.org)");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const run = args.includes("--suggest")
    ? suggest(args.filter(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--preview"), args.includes("--preview") ? args[args.indexOf("--preview") + 1] ?? null : null)
    : fetchAll().then(credits => console.log(`\n${Object.keys(credits).length} photos recorded in ${OUTPUT}.`));
  run.catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
