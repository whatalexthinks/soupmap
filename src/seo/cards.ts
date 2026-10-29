/**
 * Share cards (Open Graph images) for recipes and city guides, rendered at build time.
 *
 * Text is drawn as vector paths from the site's own fonts (Instrument Sans, Fraunces,
 * Noto Sans JP), so resvg needs no system fonts and the cards match the pages. They are
 * typographic by design: a recipe's schema.org image stays empty until it has a real,
 * licensed photograph. Node only.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

interface Glyph { path: { toSVG(): string } }
interface FontkitFont {
  unitsPerEm: number;
  ascent: number;
  hasGlyphForCodePoint(codePoint: number): boolean;
  layout(text: string): { glyphs: Glyph[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
}

const require = createRequire(import.meta.url);
const fontkit = require("fontkit") as { openSync(path: string): FontkitFont };
const modules = (path: string) => resolve("node_modules", path);
const fonts = new Map<string, FontkitFont>();
// Fraunces draws at its default (black) weight, like the site-wide share card.
const open = (path: string) => fonts.get(path) ?? fonts.set(path, fontkit.openSync(modules(path))).get(path)!;

const SANS = ["@fontsource-variable/instrument-sans/files/instrument-sans-latin-standard-normal.woff2",
  "@fontsource-variable/instrument-sans/files/instrument-sans-latin-ext-standard-normal.woff2"];
const SERIF = ["@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2",
  "@fontsource-variable/fraunces/files/fraunces-latin-ext-opsz-normal.woff2",
  "@fontsource-variable/fraunces/files/fraunces-vietnamese-opsz-normal.woff2"];

/** Noto Sans JP ships as ~120 subsets; its CSS says which file holds which code points. */
let japaneseRanges: { file: string; ranges: [number, number][] }[] | undefined;
function japaneseFont(codePoint: number): FontkitFont | undefined {
  japaneseRanges ??= [...readFileSync(modules("@fontsource/noto-sans-jp/400.css"), "utf8")
    .matchAll(/url\(\.\/files\/([^)]+\.woff2)\)[^;]*;\s*unicode-range:\s*([^;]+);/g)]
    .map(([, file, ranges]) => ({ file: `@fontsource/noto-sans-jp/files/${file}`, ranges: ranges!.split(",").map(r => {
      const [a, b] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(a!, 16), parseInt(b ?? a!, 16)] as [number, number];
    }) }));
  const hit = japaneseRanges.find(f => f.ranges.some(([a, b]) => codePoint >= a && codePoint <= b));
  return hit ? open(hit.file) : undefined;
}

const fontFor = (stack: readonly string[], char: string): FontkitFont | undefined => {
  const cp = char.codePointAt(0)!;
  return stack.map(open).find(font => font.hasGlyphForCodePoint(cp)) ?? japaneseFont(cp);
};

/** Split text into runs that one font can draw, falling back through the stack, then Japanese. */
function runs(stack: readonly string[], text: string): { font: FontkitFont; text: string }[] {
  const out: { font: FontkitFont; text: string }[] = [];
  for (const char of text) {
    const font = fontFor(stack, char);
    if (!font) continue;
    const last = out.at(-1);
    if (last?.font === font) last.text += char; else out.push({ font, text: char });
  }
  return out;
}

export function measure(stack: readonly string[], text: string, size: number, spacing = 0): number {
  return runs(stack, text).reduce((width, run) => {
    const layout = run.font.layout(run.text);
    return width + layout.positions.reduce((w, p) => w + p.xAdvance * size / run.font.unitsPerEm + spacing, 0);
  }, 0);
}

/** Text as SVG paths starting at (x, baseline). */
export function drawText(stack: readonly string[], text: string, x: number, baseline: number, size: number, fill: string, spacing = 0): string {
  let cursor = x;
  return runs(stack, text).map(run => {
    const scale = size / run.font.unitsPerEm;
    const layout = run.font.layout(run.text);
    const paths = layout.glyphs.map((glyph, i) => {
      const p = layout.positions[i]!;
      const d = glyph.path.toSVG();
      const at = cursor + p.xOffset * scale;
      cursor += p.xAdvance * scale + spacing;
      return d ? `<path transform="translate(${at.toFixed(2)} ${(baseline - p.yOffset * scale).toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})" d="${d}"/>` : "";
    }).join("");
    return `<g fill="${fill}">${paths}</g>`;
  }).join("");
}

/** Greedy word wrap; the last allowed line ends in an ellipsis if text remains. */
export function wrap(stack: readonly string[], text: string, size: number, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]!;
    if (measure(stack, next, size) <= width || !line) { line = next; continue; }
    lines.push(line);
    line = words[i]!;
    if (lines.length === maxLines) { line = ""; break; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines || (lines.length === maxLines && lines.join(" ").length < text.length)) {
    let last = lines[maxLines - 1]!;
    while (last && measure(stack, `${last}…`, size) > width) last = last.replace(/\s*\S+$/, "");
    lines.splice(maxLines - 1, lines.length, `${last.replace(/[,;:.]$/, "")}…`);
  }
  return lines.slice(0, maxLines);
}

/** Japanese set vertically, one character per row; the long-vowel mark turns with the column. */
function vertical(text: string, cx: number, top: number, size: number, fill: string): string {
  return [...text].map((char, i) => {
    const font = japaneseFont(char.codePointAt(0)!) ?? fontFor(SANS, char);
    if (!font) return "";
    const width = measure(SANS, char, size) || size;
    const baseline = top + (i + 1) * size * 1.08 - size * 0.16;
    const glyph = drawText(SANS, char, cx - width / 2, baseline, size, fill);
    return /[ーｰ〜～]/.test(char) ? `<g transform="rotate(90 ${cx} ${baseline - size * 0.36})">${glyph}</g>` : glyph;
  }).join("");
}

const PAPER = "#f7f6f0", INK = "#252c27", MUTED = "#555d53", FAINT = "#697064", SHU = "#b7442c", TINT = "#efe5d3";

const SEAL = `<g transform="translate(80 64)"><rect width="46" height="46" rx="7" fill="${SHU}"/>
  <g fill="none" stroke="#f3efe6" stroke-width="2.4" stroke-linecap="round"><path d="M16 18c-3-4 3-5 0-10"/><path d="M23 18c-3-4 3-5 0-10"/><path d="M30 18c-3-4 3-5 0-10"/></g>
  <path d="M7 24h32c0 9-7 16-16 16S7 33 7 24Z" fill="${SHU}" stroke="#f3efe6" stroke-width="2.2"/><ellipse cx="23" cy="24" rx="16" ry="4" fill="#e9c787" stroke="#f3efe6" stroke-width="2.2"/></g>`;

export interface CardText {
  kicker: string;
  title: string;
  lede?: string;
  footer: string;
  /** Japanese for the vertical panel, e.g. 味噌ラーメン. */
  mark: string;
  /** Small Japanese line under the panel, e.g. 札幌市. */
  markCaption?: string;
  /** Where the card says it's from: "soupmap.com/recipes". */
  site: string;
}

/** A 1200×630 card as SVG. */
export function cardSvg(card: CardText): string {
  const textWidth = 610;
  let titleSize = 76;
  let title = wrap(SERIF, card.title, titleSize, textWidth, 2);
  while (titleSize > 54 && (title.length > 2 || title.some(l => measure(SERIF, l, titleSize) > textWidth) || title.at(-1)!.endsWith("…"))) {
    titleSize -= 4;
    title = wrap(SERIF, card.title, titleSize, textWidth, 2);
  }
  const titleTop = 222 + titleSize * 0.8;
  const titleSvg = title.map((line, i) => drawText(SERIF, line, 80, titleTop + i * titleSize * 1.06, titleSize, INK, -0.6)).join("");
  const ledeTop = titleTop + (title.length - 1) * titleSize * 1.06 + 58;
  const lede = card.lede ? wrap(SANS, card.lede, 23, textWidth, title.length > 1 ? 3 : 4) : [];
  const ledeSvg = lede.map((line, i) => drawText(SANS, line, 82, ledeTop + i * 33, 23, MUTED)).join("");
  const chars = [...card.mark].length;
  const markSize = Math.min(78, Math.floor(400 / Math.max(chars, 1) / 1.08));
  const markTop = 98 + (420 - chars * markSize * 1.08) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="4" cy="6" r=".7" fill="#75766a" opacity=".11"/><circle cx="24" cy="19" r=".6" fill="#75766a" opacity=".08"/></pattern></defs>
  <rect width="1200" height="630" fill="${PAPER}"/><rect width="1200" height="630" fill="url(#g)"/>
  ${SEAL}${drawText(SANS, "Soupmap", 140, 98, 30, INK, -0.6)}
  ${drawText(SANS, card.kicker.toUpperCase(), 82, 196, 15, FAINT, 1.6)}
  ${titleSvg}${ledeSvg}
  <path d="M82 540h610" stroke="${INK}" stroke-width="1" opacity=".18"/>
  ${drawText(SANS, card.footer, 82, 576, 19, INK)}
  <rect x="790" y="64" width="330" height="502" rx="22" fill="${TINT}"/>
  ${vertical(card.mark, 955, markTop, markSize, SHU)}
  ${card.markCaption ? drawText(SANS, card.markCaption, 955 - measure(SANS, card.markCaption, 20) / 2, 548, 20, FAINT) : ""}
  ${drawText(SANS, card.site, 1120 - measure(SANS, card.site, 15, 0.4), 604, 15, FAINT, 0.4)}
</svg>`;
}

export function cardPng(card: CardText): Buffer {
  return Buffer.from(new Resvg(cardSvg(card), { fitTo: { mode: "width", value: 1200 } }).render().asPng());
}
