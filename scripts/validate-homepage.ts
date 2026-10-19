import { readFileSync } from "node:fs";
import { assertNoConflictMarkers } from "./lib/source-integrity.ts";

for (const path of ["index.html", "src/styles/home.css"]) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assertNoConflictMarkers(source, path);
}

console.log("Homepage source integrity passed (HTML and CSS).");
