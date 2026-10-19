import { readFileSync } from "node:fs";
import { assertNoConflictMarkers } from "./lib/source-integrity.ts";
import { assertHomepageStructure } from "./lib/homepage-integrity.ts";

for (const path of ["index.html", "src/styles/home.css"]) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assertNoConflictMarkers(source, path);
}

await assertHomepageStructure(readFileSync(new URL("../index.html", import.meta.url), "utf8"));
console.log("Homepage source integrity passed (HTML, CSS and page structure).");
