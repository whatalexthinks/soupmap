import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { ORDERED_SHOPS } from "./src/data/shops";
import { brothChipsHtml, cityButtonsHtml, resultCountText, shopListHtml } from "./src/render/templates";

const cesiumVersion: string = JSON.parse(readFileSync("node_modules/cesium/package.json", "utf8")).version;
// Versioned path, so /cesium/<version>/ can be cached as immutable forever.
const CESIUM_DIR = `cesium/${cesiumVersion}`;
const CESIUM_BUILD = "node_modules/cesium/Build/Cesium";

/**
 * HTML transforms: prerender the shop panel (crawlable, instant first paint),
 * fill site-URL placeholders, and add the analytics beacon only if a token is set.
 */
function soupmapHtml(env: Record<string, string>): Plugin {
  const siteUrl = (env.VITE_SITE_URL || "https://soupmap.com").replace(/\/+$/, "");
  const analyticsToken = (env.VITE_CF_ANALYTICS_TOKEN || "").trim();
  return {
    name: "soupmap-html",
    transformIndexHtml(html) {
      let out = html
        .replaceAll("%SITE_URL%", siteUrl)
        .replace("<!--soupmap:chips-->", brothChipsHtml(ORDERED_SHOPS))
        .replace("<!--soupmap:cities-->", cityButtonsHtml(ORDERED_SHOPS))
        .replace("<!--soupmap:count-->", resultCountText(ORDERED_SHOPS.length))
        .replace("<!--soupmap:list-->", shopListHtml(ORDERED_SHOPS));
      if (analyticsToken) {
        const beacon = JSON.stringify({ token: analyticsToken });
        out = out.replace(
          "</body>",
          `  <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='${beacon}'></script>\n  </body>`,
        );
      }
      return out;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
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
            // NaturalEarthII is Cesium's offline base layer; we run with baseLayer: false.
            src: [`${CESIUM_BUILD}/Assets/**/*`, `!${CESIUM_BUILD}/Assets/Textures/NaturalEarthII/**`],
            dest: CESIUM_DIR,
            rename: { stripBase: 4 },
          },
        ],
      }),
      soupmapHtml(env),
    ],
  };
});
