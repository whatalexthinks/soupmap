import { readFileSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";
import sirv from "sirv";
import type { Plugin } from "vite";

const DIRECTORIES = ["Workers", "ThirdParty", "Widgets", "Assets"] as const;

/** Cesium's runtime assets keep the same versioned paths in development and builds. */
export function cesiumAssets(root: string, destination: string): Plugin {
  return {
    name: "soupmap-cesium-assets",
    configureServer(server) {
      for (const directory of DIRECTORIES) {
        server.middlewares.use(
          `/${destination}/${directory}`,
          sirv(join(root, directory), { dev: true, etag: true }),
        );
      }
    },
    generateBundle() {
      const emitDirectory = (relative: string): void => {
        for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
          const path = posix.join(relative, entry.name);
          if (entry.isDirectory()) emitDirectory(path);
          else if (entry.isFile()) {
            this.emitFile({
              type: "asset",
              fileName: posix.join(destination, path),
              source: readFileSync(join(root, path)),
            });
          }
        }
      };
      // Fail the build if an expected directory is missing, rather than shipping
      // a seemingly valid map whose workers or textures will 404.
      for (const directory of DIRECTORIES) emitDirectory(directory);
    },
  };
}
