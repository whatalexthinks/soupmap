/**
 * Prints the licensing summary from src/sources.ts as a Markdown table (for README.md).
 *
 *   npm run licenses
 */
import { KIND_LABELS, SOURCES, STATUS_LABELS } from "../src/sources.ts";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
console.log("| Source | Used for | Status | License | Attribution |");
console.log("|---|---|---|---|---|");
for (const s of SOURCES) {
  console.log(
    `| [${cell(s.name)}](${s.url}) | ${cell(s.usedFor)} | ${STATUS_LABELS[s.status]} | [${cell(s.license)}](${s.licenseUrl}) | ${cell(s.attribution)} |`,
  );
}
console.log(`\n_${SOURCES.length} sources across ${new Set(SOURCES.map((s) => KIND_LABELS[s.kind])).size} kinds. Generated from src/sources.ts._`);
