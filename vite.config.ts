import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { ORDERED_SHOPS } from "./src/data/shops.ts";
import { creditsHtml } from "./src/render/credits.ts";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "./src/render/templates.ts";
import { catalogDocument, catalogPages } from "./src/render/catalog.ts";
import { esc } from "./src/ui/dom.ts";

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
  return {
    name: "soupmap-html",
    // Run after Vite's HTML emitter so the compiled credits CSS URLs exist.
    enforce: "post",
    configureServer(server) {
      const routes = new Map(documents.map(page => [page.path, page]));
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || "/", "http://vite.internal");
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
        res.end(catalogDocument(page, siteUrl, "/src/styles/credits.css"));
      });
    },
    transformIndexHtml(html) {
      let out = html
        .replaceAll("%SITE_URL%", siteUrl)
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
          source: catalogDocument(page, siteUrl, stylesheets) });
      }
      const pages = ["/", "/credits/", ...documents.map(page => page.path)];
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
          credits: resolve(import.meta.dirname, "credits/index.html"),
        },
      },
    },
    plugins: [
      viteStaticCopy({
        targets: [
          { src: `${CESIUM_BUILD}/Workers/**/*`, dest: CESIUM_DIR, rename: { stripBase: 4 } },
          { src: `${CESIUM_BUILD}/ThirdParty/**/*`, dest: CESIUM_DIR, rename: { stripBase: 4 } },
          { src: `${CESIUM_BUILD}/Widgets/**/*`, dest: CESIUM_DIR, rename: { stripBase: 4 } },
          {
            // Includes the bundled global Earth imagery used by the planet opening.
            src: [`${CESIUM_BUILD}/Assets/**/*`],
            dest: CESIUM_DIR,
            rename: { stripBase: 4 },
          },
        ],
      }),
      soupmapHtml(env),
    ],
  };
});
