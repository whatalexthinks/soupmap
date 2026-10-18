/**
 * Map markers drawn to canvas at runtime. No Cesium dependency.
 *
 * Thousands of shops share the map, so the default marker is a small bead in the
 * shop's style colour. Editor's picks get a slightly larger vermilion bowl badge,
 * and only the selected shop gets a full pin. Clusters are compact count pills.
 * Every variant comes from a small, fixed palette so Cesium's texture atlas stays bounded.
 */
import { BROTHS } from "../data/broths.ts";
import type { Shop } from "../data/shops.ts";
import { cuisineOf } from "../cuisines.ts";
import { isEditorial } from "../data/indexation.ts";

const SCALE = 2; // draw at 2x for crisp rendering on high-DPI screens
const INK = "#252c27";
const CREAM = "#fffaf0";
const VERMILION = "#b7442c";

export type MarkerKind = "dot" | "saved" | "pick";

export const MARKER_SIZE: Record<MarkerKind, number> = { dot: 16, saved: 20, pick: 26 };
export const SELECTED_SIZE = { width: 34, height: 44 } as const;

/** Unknown-broth shops are coloured by their main noodle style instead. */
const CUISINE_COLORS = {
  ramen: "#d9c3a0",
  udon: BROTHS.udon.color,
  soba: BROTHS.soba.color,
  oden: BROTHS.oden.color,
  other: "#b9b5c9",
} as const;

export function markerColor(shop: Pick<Shop, "broth" | "cuisine" | "name" | "nameJa">): string {
  if (shop.broth !== "other") return BROTHS[shop.broth].color;
  return CUISINE_COLORS[cuisineOf(shop as Shop)];
}

/** Curated records with editorial notes stand out from imported locations. */
export function markerKind(shop: Pick<Shop, "slug">, saved: boolean): MarkerKind {
  if (isEditorial(shop)) return "pick";
  return saved ? "saved" : "dot";
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w * SCALE;
  c.height = h * SCALE;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.scale(SCALE, SCALE);
  return [c, ctx];
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A tiny bowl: broth surface, body and foot. Reads as "soup" even at 10 px. */
function miniBowl(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, color: string, broth: string): void {
  const rx = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.quadraticCurveTo(cx - rx, cy + rx * 1.05, cx, cy + rx * 1.05);
  ctx.quadraticCurveTo(cx + rx, cy + rx * 1.05, cx + rx, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, rx * 0.28, 0, 0, Math.PI * 2);
  ctx.fillStyle = broth;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillRect(cx - rx * 0.32, cy + rx * 1.05, rx * 0.64, 1.6);
}

const markerCache = new Map<string, HTMLCanvasElement>();

export function markerImageId(kind: MarkerKind, color: string): string {
  return `marker:${kind}:${color}`;
}

/** Bead, saved bead (vermilion ring) or editor's-pick badge, anchored at its centre. */
export function markerGlyph(kind: MarkerKind, color: string): HTMLCanvasElement {
  const key = markerImageId(kind, color);
  const cached = markerCache.get(key);
  if (cached) return cached;
  const s = MARKER_SIZE[kind];
  const [c, ctx] = canvas(s, s);
  const m = s / 2;
  if (kind === "pick") {
    circle(ctx, m, m, m - 0.5, CREAM);
    circle(ctx, m, m, m - 2.2, VERMILION);
    miniBowl(ctx, m, m - 2.5, 13, CREAM, color);
  } else if (kind === "saved") {
    circle(ctx, m, m, m - 0.5, CREAM);
    circle(ctx, m, m, m - 2, VERMILION);
    circle(ctx, m, m, m - 4.6, color);
  } else {
    circle(ctx, m, m, m - 0.5, "rgba(255,250,240,0.92)");
    circle(ctx, m, m, m - 2, INK);
    circle(ctx, m, m, m - 3.6, color);
  }
  markerCache.set(key, c);
  return c;
}

const selectedCache = new Map<string, HTMLCanvasElement>();

/** The one prominent pin: an ink teardrop holding a bowl, anchored bottom-centre. */
export function selectedGlyph(color: string): HTMLCanvasElement {
  const cached = selectedCache.get(color);
  if (cached) return cached;
  const { width: w, height: h } = SELECTED_SIZE;
  const [c, ctx] = canvas(w, h);
  const cx = w / 2;
  const r = w / 2 - 2;
  const cy = r + 2;

  ctx.beginPath();
  ctx.ellipse(cx, h - 2.5, 6, 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.2);
  ctx.quadraticCurveTo(cx + r * 0.45, cy + r * 1.15, cx, h - 3);
  ctx.quadraticCurveTo(cx - r * 0.45, cy + r * 1.15, cx + r * Math.cos(Math.PI * 0.8), cy + r * Math.sin(Math.PI * 0.8));
  ctx.closePath();
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = CREAM;
  ctx.stroke();

  miniBowl(ctx, cx, cy - 2.5, 17, CREAM, color);
  selectedCache.set(color, c);
  return c;
}

/** A small, reusable badge palette instead of one GPU texture per exact count. */
export function clusterLabel(count: number): string {
  if (count < 100) return String(count);
  const step = 10 ** Math.floor(Math.log10(count));
  const lower = Math.floor(count / step) * step;
  return `${lower >= 1_000_000 ? `${lower / 1_000_000}m` : lower >= 1000 ? `${lower / 1000}k` : lower}+`;
}

/** Pill height grows gently with magnitude so dense areas read at a glance. */
export function clusterHeight(count: number): number {
  return count < 10 ? 20 : count < 100 ? 22 : count < 1000 ? 25 : 28;
}

const clusterCache = new Map<string, { canvas: HTMLCanvasElement; width: number; height: number }>();

/** Cluster badge: an ink pill with a count. Width follows the label, so "30k+" never overflows. */
export function clusterGlyph(count: number): { canvas: HTMLCanvasElement; width: number; height: number } {
  const label = clusterLabel(count);
  const height = clusterHeight(count);
  const key = `${label}:${height}`;
  const cached = clusterCache.get(key);
  if (cached) return cached;
  const fontSize = Math.round(height * 0.5);
  const font = `700 ${fontSize}px 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif`;
  const [, measure] = canvas(1, 1);
  measure.font = font;
  const width = Math.max(height, Math.ceil(measure.measureText(label).width) + 14);
  const [c, ctx] = canvas(width, height);
  const r = height / 2;
  // Arcs rather than roundRect(), which older Safari lacks.
  const inset = 0.75, pr = r - inset;
  ctx.beginPath();
  ctx.arc(inset + pr, r, pr, Math.PI / 2, Math.PI * 1.5);
  ctx.arc(width - inset - pr, r, pr, Math.PI * 1.5, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = "rgba(37,44,39,0.92)";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = CREAM;
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, width / 2, r + 0.5);
  const glyph = { canvas: c, width, height };
  clusterCache.set(key, glyph);
  return glyph;
}
