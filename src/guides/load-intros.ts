/** Node-only: read every guide intro in content/guides/ (build and tests). */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { parseGuideIntro, type GuideIntro } from "./intros.ts";

export const GUIDES_DIR = new URL("../../content/guides/", import.meta.url);

export function loadGuideIntros(dir: URL = GUIDES_DIR): GuideIntro[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith(".md") && name !== "README.md").sort()
    .map(name => parseGuideIntro(name.slice(0, -3), readFileSync(new URL(name, dir), "utf8")));
}
