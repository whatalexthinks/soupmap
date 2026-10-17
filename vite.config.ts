import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { ORDERED_SHOPS } from "./src/data/shops.ts";
import { creditsHtml } from "./src/render/credits.ts";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "./src/render/templates.ts";

const cesiumVersion: string = JSON.parse(readFileSync("node_modules/cesium/package.json", "utf8")).version;
// Versioned path, so /cesium/<version>/ can be cached as immutable forever.
const CESIUM_DIR = `cesium/${cesiumVersion}`;
const CESIUM_BUILD = "node_modules/cesium/Build/Cesium";

/**
 * HTML transforms: prerender the shop panel and the /credits page (crawlable,
 * instant first paint), fill site-URL placeholders, add the analytics beacon only
 * if a token is set, and emit discovery files for the configured site URL.
 */
export function soupmapHtml(env: Record<string, string>): Plugin {
  const siteUrl = (env.VITE_SITE_URL || "https://soupmap.com").replace(/\/+$/, "");
  const analyticsToken = (env.VITE_CF_ANALYTICS_TOKEN || "").trim();
  return {
    name: "soupmap-html",
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
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      const pages = ["/", "/credits/"];
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${siteUrl}${p}</loc><lastmod>${today}</lastmod></url>`).join("\n")}
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
- [Credits and source limitations](${siteUrl}/credits/): Data sources, attribution, licenses, and verification context.
- [Open-data catalog](${siteUrl}/data/open-shops.json.gz): Downloadable gzip-compressed JSON of reported locations, with Overture IDs and per-record source licenses. Decompress before reading as JSON.

## Data limitations

Coverage is incomplete. Imported open-data listings are unverified reported locations, not independently checked recommendations. Do not infer that a business is still open or that coordinates, names, menus, prices, hours, or broth styles have been verified.

Generated Latin romanizations of Japanese shop and locality names are approximate readings, not official English names or verified translations. Preserve original Japanese names when citing records. Follow the source credits and each record's licenses when reusing data.

## Discovery and access

This optional guide follows an emerging convention. It is not an indexing requirement, does not grant crawl access or training permission, and does not replace crawlable catalog pages, robots.txt, or the sitemap.

Only the homepage and credits currently have indexable page entries; interactive shop selections are not dedicated city or shop pages. Consult [the sitemap](${siteUrl}/sitemap.xml) for published page URLs.
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
