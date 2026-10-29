import { validateCommerce } from './scripts/lib/validate-commerce.ts';
import { renderSiteShell } from "./src/render/shell.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { cesiumAssets } from "./scripts/lib/cesium-assets.ts";
import { OPEN_CATALOG, ORDERED_SHOPS } from "./src/data/shops.ts";
import { creditsHtml } from "./src/render/credits.ts";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "./src/render/templates.ts";
import { catalogDocument, catalogPages } from "./src/render/catalog.ts";
import { esc } from "./src/ui/dom.ts";
import { loadJournal } from "./src/journal/load.ts";
import { journalBody, journalDocument, journalFeed, journalHead, journalPages } from "./src/render/journal.ts";
import { loadRecipes } from "./src/recipes/load.ts";
import { cuisineOf, recipePages, recipeQuality, recipesBody, recipesDocument, recipesHead } from "./src/render/recipes.ts";
import { homeCitiesHtml, homeCityHtml } from "./src/render/home.ts";
import { buildGuides, cityHubPath, styleHubPath } from "./src/guides/model.ts";
import { guideSite, indexEligible } from "./src/render/guides.ts";
import { areaOptions } from "./src/me/planner.ts";
import { loadGuideIntros } from "./src/guides/load-intros.ts";
import { validateGuideIntros } from "./src/guides/intros.ts";
import { placesForRecipe } from "./src/recipes/places.ts";
import { affiliateConfig } from "./src/recipes/pantry.ts";
import { formatAmount } from "./src/recipes/quantity.ts";
import { assessPages, robotsFor } from "./src/seo/quality.ts";
import { cardPng, type CardText } from "./src/seo/cards.ts";
import { guideCard, guideCardPath, recipeCard, recipeCardPath, styleCard, styleCardPath } from "./src/seo/share.ts";
import { catalogQuality, llmsFullTxt, llmsTxt, recipesJson, robotsTxt, sitemapFiles, sitemapIndex, type DiscoveryContext, type SitemapEntry } from "./src/seo/site.ts";

const JOURNAL_MODULE = "virtual:soupmap-journal";

/** The journal's index (no bodies) for pages that link to articles, such as /me/. */
export function journalIndex(): Plugin {
  const resolved = `\0${JOURNAL_MODULE}`;
  return {
    name: "soupmap-journal-index",
    resolveId: id => id === JOURNAL_MODULE ? resolved : null,
    load(id) {
      if (id !== resolved) return null;
      const index = loadJournal().map(({ slug, title, dek, category, mark }) => ({ slug, title, dek, category, mark }));
      return `export default ${JSON.stringify(index)};`;
    },
  };
}

const cesiumVersion: string = JSON.parse(readFileSync("node_modules/cesium/package.json", "utf8")).version;
// Versioned path, so /cesium/<version>/ can be cached as immutable forever.
const CESIUM_DIR = `cesium/${cesiumVersion}`;
const CESIUM_BUILD = "node_modules/cesium/Build/Cesium";

/**
 * Prerender the map panel, credits, and substantive catalog documents. Fill
 * canonical origins, add the optional analytics beacon to the app shells, and
 * emit discovery files that agree with the generated static routes.
 */
export function soupmapHtml(env: Record<string, string>): Plugin {
  const siteUrl = (env.VITE_SITE_URL || "https://soupmap.com").replace(/\/+$/, "");
  const analyticsToken = (env.VITE_CF_ANALYTICS_TOKEN || "").trim();
  validateCommerce();
  const documents = catalogPages(ORDERED_SHOPS);
  const articles = loadJournal();
  const journal = journalPages(articles);
  const journalIndex = journal.find(page => page.path === "/journal/")!;
  const recipes = loadRecipes(new Set(articles.map(a => a.slug)));
  // City × style guides, and the recipe pages that point at them.
  const catalogDate = OPEN_CATALOG.generatedAt.slice(0, 10);
  const guides = buildGuides(ORDERED_SHOPS);
  const intros = loadGuideIntros();
  // "Plan a day here" may only link to prefectures the planner itself offers.
  const plannable = new Set(areaOptions(ORDERED_SHOPS).flatMap(a => a.id.startsWith("pref:") ? [a.id.slice("pref:".length)] : []));
  const guidePages = guideSite(guides, { articles: new Map(articles.map(a => [a.slug, a.title])), lastmod: catalogDate, intros: new Map(intros.map(i => [i.slug, i])), plannable });
  const places = new Map(recipes.flatMap(r => { const p = placesForRecipe(r.slug, guides, indexEligible); return p ? [[r.slug, p] as const] : []; }));
  const recipeSite = recipePages(recipes, { places, affiliate: affiliateConfig(env) });
  const recipesIndex = recipeSite.find(page => page.path === "/recipes/")!;
  {
    const published = new Set(["/", "/map/", "/me/", "/credits/", "/catalog/", ...recipeSite, ...journal, ...documents, ...guidePages].map(page => typeof page === "string" ? page : page.path));
    const problems = validateGuideIntros(intros, new Set(guides.map(g => g.path.slice("/guides/".length, -1))), published);
    // A data refresh can shrink a guide below three places; that shouldn't stop a publish.
    const orphans = problems.filter(p => p.includes("no guide at"));
    if (orphans.length) console.warn(`Guide intros without a guide (not shown):\n- ${orphans.join("\n- ")}`);
    if (problems.length > orphans.length) throw new Error(`Guide intro problems:\n- ${problems.filter(p => !orphans.includes(p)).join("\n- ")}`);
  }
  // The quality gate: pages that fail are published with noindex and left out of the sitemaps.
  const verdicts = assessPages([...recipeSite.map(page => recipeQuality(page, recipes)), ...documents.map(catalogQuality), ...guidePages.map(page => page.quality)]);
  for (const page of [...recipeSite, ...documents, ...guidePages]) page.robots = robotsFor(verdicts.get(page.path));
  // Share cards: every recipe, every guide with an editorial intro, and the indexable style hubs.
  const host = new URL(siteUrl).host;
  const cards = new Map<string, CardText>();
  for (const page of recipeSite) if (page.recipe) { page.image = recipeCardPath(page.recipe.slug); cards.set(page.image, recipeCard(page.recipe, host)); }
  const introBySlug = new Map(intros.map(i => [i.slug, i]));
  const guideByPath = new Map(guides.map(g => [g.path, g]));
  for (const page of guidePages) {
    const guide = guideByPath.get(page.path);
    const intro = guide && introBySlug.get(guide.path.slice("/guides/".length, -1));
    if (guide && intro) { page.image = guideCardPath(intro.slug); cards.set(page.image, guideCard(guide, intro, host)); continue; }
    const style = page.path.match(/^\/guides\/style\/([a-z0-9-]+)\/$/)?.[1];
    if (style && verdicts.get(page.path)?.indexable) {
      const list = guides.filter(g => g.style.id === style);
      page.image = styleCardPath(style);
      cards.set(page.image, styleCard(list[0]!.style, list, host));
    }
  }
  let directoryChunk: string;
  let building = false;
  return {
    name: "soupmap-html",
    configResolved(config) { building = config.command === "build"; },
    buildStart() { if (building) directoryChunk = this.emitFile({type:"chunk", id:resolve("src/catalog-entry.ts"), name:"directory"}); },
    // Run after Vite's HTML emitter so the compiled credits CSS URLs exist.
    enforce: "post",
    configureServer(server) {
      const routes = new Map([...documents, ...guidePages].map(page => [page.path, page]));
      const journalRoutes = new Map(journal.filter(page => page !== journalIndex).map(page => [page.path, page]));
      const recipeRoutes = new Map(recipeSite.filter(page => page !== recipesIndex).map(page => [page.path, page]));
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://vite.internal");
        const recipePage = recipeRoutes.get(url.pathname);
        if (recipePage) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(recipesDocument(recipePage, siteUrl, recipes, { styles: ["/src/styles/recipes.css"], scripts: ["/src/recipes/main.ts"] }));
          return;
        }
        const journalPage = journalRoutes.get(url.pathname);
        if (journalPage) {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(journalDocument(journalPage, siteUrl, articles, ["/src/styles/journal.css"]));
          return;
        }
        if (!/^\/(?:shop|city|catalog|guides)(?:\/|$)/.test(url.pathname)) return next();
        const path = `${url.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "")}/`;
        if(path.startsWith('/shop/')) {
          const replacement=path.replace('/shop/','/catalog/');
          if(routes.has(replacement)){res.statusCode=301;res.setHeader('Location',replacement+url.search);res.end();return;}
        }
        const page = routes.get(path);
        if (!page) {
          res.statusCode = 404;
          res.setHeader("X-Robots-Tag", "noindex");
          res.end("Shop or catalog page not found.");
          return;
        }
        if (url.pathname !== path) {
          res.statusCode = 301;
          res.setHeader("Location", path + url.search);
          res.end();
          return;
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(catalogDocument(page, siteUrl, "/src/styles/credits.css", "/src/catalog-entry.ts"));
      });
    },
    transformIndexHtml(html) {
      let out = renderSiteShell(html)
        .replaceAll("%SITE_URL%", siteUrl)
        .replace("<!--soupmap:journal-head-->", journalHead(journalIndex, siteUrl, articles))
        .replace("<!--soupmap:journal-body-->", journalBody(journalIndex))
        .replace("<!--soupmap:recipes-head-->", recipesHead(recipesIndex, siteUrl, recipes))
        .replace("<!--soupmap:recipes-body-->", recipesBody(recipesIndex))
        .replace("<!--soupmap:home-cities-->", homeCitiesHtml())
        .replace("<!--soupmap:home-featured-->", homeCityHtml())
        .replace("<!--soupmap:chips-->", brothChipsHtml(ORDERED_SHOPS))
        .replace("<!--soupmap:cities-->", cityButtonsHtml(ORDERED_SHOPS))
        .replace("<!--soupmap:count-->", resultCountText(ORDERED_SHOPS.filter(s => s.city === "Tokyo").length))
        .replace("<!--soupmap:list-->", shopListHtml(ORDERED_SHOPS.filter(s => s.city === "Tokyo")))
        .replace("<!--soupmap:credits-->", creditsHtml(ORDERED_SHOPS));
      if (analyticsToken) {
        const beacon = JSON.stringify({ token: analyticsToken });
        out = out.replace(
          "</body>",
          `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${beacon}'></script>\n  </body>`,
        );
      }
      return out;
    },
    generateBundle(_options, bundle) {
      // Reuse the existing readable-document stylesheet after Vite fingerprints it.
      const credits = bundle["credits/index.html"];
      const stylesheets = credits?.type === "asset"
        ? [...String(credits.source).matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]!) : [];
      if (!stylesheets.length) throw new Error("Missing compiled credits stylesheet for catalog documents.");
      for (const page of [...documents, ...guidePages]) {
        this.emitFile({ type: "asset", fileName: `${page.path.slice(1)}index.html`,
          source: catalogDocument(page, siteUrl, stylesheets, directoryChunk ? `/${this.getFileName(directoryChunk)}` : undefined) });
      }
      // The journal pages reuse the stylesheet Vite compiled for journal/index.html.
      const journalShell = bundle["journal/index.html"];
      const journalStyles = journalShell?.type === "asset"
        ? [...String(journalShell.source).matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]!) : [];
      if (!journalStyles.length) throw new Error("Missing compiled journal stylesheet.");
      for (const page of journal) {
        if (page === journalIndex) continue;
        this.emitFile({ type: "asset", fileName: `${page.path.slice(1)}index.html`,
          source: journalDocument(page, siteUrl, articles, journalStyles) });
      }
      this.emitFile({ type: "asset", fileName: "journal/feed.xml", source: journalFeed(articles, siteUrl) });
      // Recipe pages reuse the stylesheet and script Vite compiled for recipes/index.html.
      const recipesShell = bundle["recipes/index.html"];
      const shell = recipesShell?.type === "asset" ? String(recipesShell.source) : "";
      const recipeAssets = {
        styles: [...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(match => match[1]!),
        scripts: [...shell.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map(match => match[1]!),
      };
      if (!recipeAssets.styles.length || !recipeAssets.scripts.length) throw new Error("Missing compiled recipes stylesheet or script.");
      for (const page of recipeSite) {
        if (page === recipesIndex) continue;
        this.emitFile({ type: "asset", fileName: `${page.path.slice(1)}index.html`, source: recipesDocument(page, siteUrl, recipes, recipeAssets) });
      }
      for (const [path, card] of cards) this.emitFile({ type: "asset", fileName: path.slice(1), source: cardPng(card) });
      // Segmented sitemaps behind one index. /sitemap.xml serves the index too, so the
      // URL already submitted to Search Console keeps working.
      const recipeDates = new Map(recipes.map(r => [`/recipes/${r.slug}/`, r.updated ?? r.date]));
      const articleDates = new Map(articles.map(a => [`/journal/${a.slug}/`, a.date]));
      const segments: Record<"pages" | "journal" | "recipes" | "catalog" | "cities", SitemapEntry[]> = {
        pages: ["/", "/map/", "/me/", "/credits/", "/claim/"].map(path => ({ path })),
        journal: journal.map(page => ({ path: page.path, lastmod: articleDates.get(page.path) })),
        recipes: recipeSite.map(page => ({ path: page.path, lastmod: recipeDates.get(page.path) })),
        catalog: documents.map(page => ({ path: page.path, lastmod: catalogDate })),
        cities: guidePages.map(page => ({ path: page.path, lastmod: page.lastmod })),
      };
      const files = sitemapFiles(segments, verdicts, siteUrl);
      for (const file of files) this.emitFile({ type: "asset", fileName: file.file, source: file.source });
      const index = sitemapIndex(files, siteUrl);
      this.emitFile({ type: "asset", fileName: "sitemap_index.xml", source: index });
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: index });
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(siteUrl) });
      const indexable = (path: string) => verdicts.get(path)?.indexable !== false;
      const byStyle = new Map<string, number>();
      const byCity = new Map<string, { label: string; path: string; guides: number }>();
      for (const guide of guides) {
        byStyle.set(guide.style.id, (byStyle.get(guide.style.id) ?? 0) + 1);
        const path = cityHubPath(guide.place);
        const city = byCity.get(path) ?? { label: guide.place.label, path, guides: 0 };
        city.guides++;
        byCity.set(path, city);
      }
      const discovery: DiscoveryContext = {
        siteUrl, recipes, articles, cuisine: cuisineOf, sitemaps: files,
        styles: [...new Map(guides.map(g => [g.style.id, g.style])).values()].filter(style => indexable(styleHubPath(style)))
          .map(style => ({ style, path: styleHubPath(style), cities: byStyle.get(style.id)! })),
        cities: [...byCity.values()].filter(city => indexable(city.path)).sort((a, b) => b.guides - a.guides || a.label.localeCompare(b.label)),
      };
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llmsTxt(discovery) });
      this.emitFile({ type: "asset", fileName: "llms-full.txt", source: llmsFullTxt(discovery) });
      this.emitFile({ type: "asset", fileName: "recipes/recipes.json", source: recipesJson(recipes, siteUrl, cuisineOf,
        recipe => recipe.ingredients.flatMap(g => g.items.map(i => (i.amount ? `${formatAmount(i.amount)} ${i.text}` : i.text).replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")))) });
      const counts = [...verdicts.values()].reduce((n, v) => (v.indexable ? n.index++ : n.noindex++, n), { index: 0, noindex: 0 });
      if (typeof this.info === "function") this.info(`quality gate: ${counts.index} pages indexable, ${counts.noindex} noindex; sitemaps list ${files.reduce((n, f) => n + f.count, 0)} URLs`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    server: {
      host: "0.0.0.0",
      port: 5000,
      strictPort: true,
      allowedHosts: [".replit.dev", ".replit.app", ".repl.co", "terminal.local"],
    },
    define: {
      __CESIUM_BASE_URL__: JSON.stringify(`/${CESIUM_DIR}/`),
    },
    build: {
      target: "es2022",
      // Cesium is one large lazy chunk by design; it loads after first paint.
      chunkSizeWarningLimit: 6000,
      rolldownOptions: {
        input: {
          main: resolve(import.meta.dirname, "index.html"),
          map: resolve(import.meta.dirname, "map/index.html"),
          account: resolve(import.meta.dirname, "account/index.html"),
          credits: resolve(import.meta.dirname, "credits/index.html"),
          privacy: resolve(import.meta.dirname, "privacy/index.html"),
          claim: resolve(import.meta.dirname, "claim/index.html"),
          terms: resolve(import.meta.dirname, "terms/index.html"),
          moderate: resolve(import.meta.dirname, "moderate/index.html"),
          journal: resolve(import.meta.dirname, "journal/index.html"),
          recipes: resolve(import.meta.dirname, "recipes/index.html"),
          me: resolve(import.meta.dirname, "me/index.html"),
        },
      },
    },
    plugins: [
      cesiumAssets(resolve(CESIUM_BUILD), CESIUM_DIR),
      journalIndex(),
      soupmapHtml(env),
    ],
  };
});
