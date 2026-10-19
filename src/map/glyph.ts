/**
 * Bowl glyphs drawn to canvas at runtime: map pins and cluster badges. No Cesium dependency.
 */
import { BROTHS, type BrothId } from "../data/broths.ts";

const SCALE = 2; // draw at 2x for crisp rendering on high-DPI screens
const LACQUER = "#17142c";
const RIM = "#f3efe6";
const LANTERN = "#f2a541";

export const PIN_SIZE = { width: 48, height: 60 } as const;
export const CLUSTER_SIZE = 52;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w * SCALE;
  c.height = h * SCALE;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.scale(SCALE, SCALE);
  return [c, ctx];
}

/** Draws a bowl centred at (cx, rimY) with rim radius rx. */
function drawBowl(ctx: CanvasRenderingContext2D, cx: number, rimY: number, rx: number, broth: string, selected: boolean) {
  const ry = rx * 0.3;
  const depth = rx * 1.05;

  // body
  ctx.beginPath();
  ctx.moveTo(cx - rx, rimY);
  ctx.bezierCurveTo(cx - rx, rimY + depth * 0.9, cx - rx * 0.45, rimY + depth, cx, rimY + depth);
  ctx.bezierCurveTo(cx + rx * 0.45, rimY + depth, cx + rx, rimY + depth * 0.9, cx + rx, rimY);
  ctx.closePath();
  const body = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
  body.addColorStop(0, "#2b2650");
  body.addColorStop(0.55, LACQUER);
  body.addColorStop(1, "#0c0a1c");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = selected ? LANTERN : "rgba(243,239,230,0.85)";
  ctx.stroke();

  // band of colour on the bowl, a hint of the broth
  ctx.beginPath();
  ctx.ellipse(cx, rimY + depth * 0.42, rx * 0.86, ry * 0.5, 0, 0.15, Math.PI - 0.15);
  ctx.strokeStyle = broth;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // foot
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.32, rimY + depth - 0.5);
  ctx.lineTo(cx + rx * 0.32, rimY + depth - 0.5);
  ctx.lineTo(cx + rx * 0.24, rimY + depth + 3.5);
  ctx.lineTo(cx - rx * 0.24, rimY + depth + 3.5);
  ctx.closePath();
  ctx.fillStyle = LACQUER;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = selected ? LANTERN : "rgba(243,239,230,0.7)";
  ctx.stroke();

  // broth surface
  ctx.beginPath();
  ctx.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = broth;
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = selected ? LANTERN : RIM;
  ctx.stroke();

  // a glint of fat on the surface
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35, rimY - ry * 0.15, rx * 0.16, ry * 0.28, -0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.fill();
}

function drawSteam(ctx: CanvasRenderingContext2D, cx: number, baseY: number, height: number, color: string) {
  ctx.lineCap = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  const offsets = [-7, 0, 7];
  offsets.forEach((dx, i) => {
    const top = baseY - height + (i === 1 ? 0 : 4);
    const x = cx + dx;
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.bezierCurveTo(x - 4, baseY - height * 0.3, x + 4, baseY - height * 0.55, x, top + 4);
    ctx.quadraticCurveTo(x - 2, top + 1, x + 1, top);
    ctx.stroke();
  });
}

const pinCache = new Map<string, HTMLCanvasElement>();

/** Map pin: steaming bowl over a ground shadow, anchored bottom-centre. */
export function pinGlyph(broth: BrothId, selected = false): HTMLCanvasElement {
  const key = `${broth}:${selected}`;
  const cached = pinCache.get(key);
  if (cached) return cached;

  const { width: w, height: h } = PIN_SIZE;
  const [c, ctx] = canvas(w, h);
  const cx = w / 2;
  const color = BROTHS[broth].color;

  // ground shadow + stem so the bowl reads as "standing" on the spot
  ctx.beginPath();
  ctx.ellipse(cx, h - 3, 9, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, h - 4);
  ctx.lineTo(cx, h - 13);
  ctx.lineWidth = 2;
  ctx.strokeStyle = selected ? LANTERN : "rgba(243,239,230,0.9)";
  ctx.stroke();

  if (selected) {
    const glow = ctx.createRadialGradient(cx, 32, 4, cx, 32, 24);
    glow.addColorStop(0, "rgba(242,165,65,0.55)");
    glow.addColorStop(1, "rgba(242,165,65,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 6, w, 52);
  }

  drawSteam(ctx, cx, 21, 15, selected ? "rgba(255,226,180,0.95)" : "rgba(243,239,230,0.85)");
  drawBowl(ctx, cx, 27, 17, color, selected);

  pinCache.set(key, c);
  return c;
}

const clusterCache = new Map<string, HTMLCanvasElement>();

/** A small, reusable badge palette instead of one GPU texture per exact count. */
export function clusterLabel(count: number): string {
  if (count < 100) return String(count);
  const step = 10 ** Math.floor(Math.log10(count));
  const lower = Math.floor(count / step) * step;
  return `${lower >= 1_000_000 ? `${lower / 1_000_000}m` : lower >= 1000 ? `${lower / 1000}k` : lower}+`;
}

/** Cluster badge: lantern ring with a count. */
export function clusterGlyph(count: number): HTMLCanvasElement {
  const label = clusterLabel(count);
  const cached = clusterCache.get(label);
  if (cached) return cached;
  const s = CLUSTER_SIZE;
  const [c, ctx] = canvas(s, s);
  const r = s / 2 - 4;

  ctx.beginPath();
  ctx.arc(s / 2, s / 2, r + 3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(242,165,65,0.22)";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15,13,34,0.92)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = LANTERN;
  ctx.stroke();

  // a tiny bowl rim above the count
  ctx.beginPath();
  ctx.ellipse(s / 2, s / 2 - 9, 8, 2.4, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(243,239,230,0.8)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = RIM;
  ctx.font = "700 17px 'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, s / 2, s / 2 + 5);

  clusterCache.set(label, c);
  return c;
}
