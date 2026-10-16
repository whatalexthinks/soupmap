/** Small helpers shared by the data scripts. */
import { readFileSync } from "node:fs";
import { ShopsSchema, type Shop } from "../../src/data/schema.ts";

export const color = {
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

/** `--flag value`, `--flag=value` and bare `--flag` → { flag: "value" | true }. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    const next = argv[i + 1];
    if (inline !== undefined) out[key] = inline;
    else if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

export function loadShops(): Shop[] {
  const raw: unknown = JSON.parse(readFileSync(new URL("../../src/data/shops.json", import.meta.url), "utf8"));
  return ShopsSchema.parse(raw);
}

/** Great-circle distance in metres. */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 30_000, ...rest } = init;
  return fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Error text including the underlying cause (Node's fetch hides it behind "fetch failed"). */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  return cause ? `${error.message} (${cause.code ?? cause.message ?? "unknown cause"})` : error.message;
}
