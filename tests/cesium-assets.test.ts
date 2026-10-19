import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cesiumAssets } from "../scripts/lib/cesium-assets.ts";

test("Cesium assets preserve versioned nested paths and binary contents without glob dependencies", async () => {
  const root = mkdtempSync(join(tmpdir(), "soupmap-cesium-"));
  try {
    for (const directory of ["Workers", "ThirdParty", "Widgets", "Assets/Textures/NaturalEarthII"]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    const image = Buffer.from([0, 255, 128, 45]);
    writeFileSync(join(root, "Assets/Textures/NaturalEarthII/earth.jpg"), image);
    writeFileSync(join(root, "Workers/worker.js"), "export {};");
    writeFileSync(join(root, "Cesium.js"), "not a runtime asset");
    const plugin = cesiumAssets(root, "cesium/test-version");
    const hook = plugin.generateBundle;
    assert.equal(typeof hook, "function");
    const emitted: Array<{fileName: string; source: Buffer}> = [];
    await (hook as Function).call({emitFile: (asset: typeof emitted[number]) => emitted.push(asset)});
    assert.deepEqual(emitted.map(asset => asset.fileName).sort(), [
      "cesium/test-version/Assets/Textures/NaturalEarthII/earth.jpg",
      "cesium/test-version/Workers/worker.js",
    ]);
    assert.deepEqual(emitted.find(asset => asset.fileName.endsWith(".jpg"))!.source, image);
    rmSync(join(root, "Widgets"), { recursive: true });
    assert.throws(() => (hook as Function).call({emitFile() {}}), /ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
