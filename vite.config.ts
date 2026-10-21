import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { cesiumAssets } from "./scripts/lib/cesium-assets.ts";
import { ORDERED_SHOPS } from "./src/data/shops.ts";
import { creditsHtml } from "./src/render/credits.ts";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "./src/render/templates.ts";
import { catalogDocument, catalogPages } from "./src/render/catalog.ts";
import { esc } from "./src/ui/dom.ts";
import { loadJournal } from "./src/journal/load.ts";
import { journalBody, journalDocument, journalFeed, journalHead, journalPages } from "./src/render/journal.ts";
import { loadRecipes } from "./src/recipes/load.ts";
import { recipePages, recipesBody, recipesDocument, recipesHead } from "./src/render/recipes.ts";
import { homeCitiesHtml, homeCityHtml } from "./src/render/home.ts";

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
  const documents = catalogPages(ORDERED_SHOPS);
  const articles = loadJournal();
  const journal = journalPages(articles);
  const journalIndex = journal.find(page => page.path === "/journal/")!;
  const recipes = loadRecipes(new Set(articles.map(a => a.slug)));
  const recipeSite = recipePages(recipes);
  const recipesIndex = recipeSite.find(page => page.path === "/recipes/")!;
  let directoryChunk: string;
  return {
    name: "soupmap-html",
    buildStart() { directoryChunk = this.emitFile({type:"chunk", id:resolve("src/catalog-entry.ts"), name:"directory"}); },
    // Run after Vite's HTML emitter so the compiled credits CSS URLs exist.
    enforce: "post",
    configureServer(server) {
      const routes = new Map(documents.map(page => [page.path, page]));
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
        if (!/^\/(?:shop|city|catalog)(?:\/|$)/.test(url.pathname)) return next();
        const path = `${url.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "")}/`;
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
      let out = html
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
      for (const page of documents) {
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
      const pages = ["/", "/map/", "/me/", "/credits/", ...recipeSite.map(page => page.path), ...journal.map(page => page.path), ...documents.map(page => page.path)];
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${esc(siteUrl + p)}</loc></url>`).join("\n")}
</urlset>
`,
      });
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: "llms.txt",
        source: `# Soupmap

> A worldwide soup atlas for curious travelers. Current listings are a Japan pilot, not worldwide coverage.

## Public resources

- [Atlas](${siteUrl}/): Public homepage with an initial shop list; interactive map and search explore more listings.
- [Soupmap Recipes](${siteUrl}/recipes/): ${recipes.length} soup recipes from Japan and around the world, browsable by region, kind of soup, diet and time. Each recipe page carries schema.org Recipe data. Reader reviews and tips, where present, load separately and are not part of the static pages.
- [Soupmap Journal](${siteUrl}/journal/): ${articles.length} editorial essays on ramen styles, noodles, Japanese soups, ingredients, history, travel etiquette and soups of the world. Each article lists further reading. RSS: ${siteUrl}/journal/feed.xml
- [Japan catalog](${siteUrl}/catalog/): Paginated, crawlable nationwide locations and featured city directories. Substantive editorial records have standalone shop pages; basic open-data records do not.
- [Credits and source limitations](${siteUrl}/credits/): Data sources, attribution, licenses, and verification context.
- [Open-data catalog](${siteUrl}/data/open-shops.json.gz): Downloadable gzip-compressed JSON of reported locations, with Overture IDs and per-record source licenses. Decompress before reading as JSON.

## Data limitations

Coverage is incomplete. Imported open-data listings are unverified reported locations, not independently checked recommendations. Do not infer that a business is still open or that coordinates, names, menus, prices, hours, or broth styles have been verified.

Generated Latin romanizations of Japanese shop and locality names are approximate readings, not official English names or verified translations. Preserve original Japanese names when citing records. Follow the source credits and each record's licenses when reusing data.

## Discovery and access

This optional guide follows an emerging convention. It is not an indexing requirement, does not grant crawl access or training permission, and does not replace crawlable catalog pages, robots.txt, or the sitemap.

Shop selections on the interactive map can still use fragments. These are not dedicated city or shop pages. Use the ordinary links in [the catalog](${siteUrl}/catalog/) and consult [the sitemap](${siteUrl}/sitemap.xml) for published canonical page URLs.
`,
      });
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
      allowedHosts: [".replit.dev", ".replit.app", ".repl.co"],
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
