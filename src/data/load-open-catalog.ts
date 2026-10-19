import type { OpenPlace } from "./open-catalog.ts";

export interface OpenCatalog {
  release: string;
  generatedAt: string;
  attribution: string;
  notice: string;
  records: OpenPlace[];
}

export async function catalogResponseText(response: Response): Promise<string> {
  if (!response.ok) throw new Error("Open-data catalog could not load. Reload to retry.");
  const bytes = await response.arrayBuffer();
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
  // Vite/CDNs may set Content-Encoding: gzip, which browsers already decode.
  // Static file hosts may instead serve the raw .gz. Support both explicitly.
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  }
  return new TextDecoder().decode(bytes);
}

/** Compressed at rest and in transit; no multi-megabyte raw data in Git. */
export async function loadOpenCatalog(): Promise<OpenCatalog> {
  let text: string;
  if (typeof window === "undefined") {
    // Node-only build/tests path. Variable imports keep Node modules out of browser bundles.
    const fsModule = "node:fs/promises";
    const zipModule = "node:zlib";
    const { readFile } = await import(/* @vite-ignore */ fsModule);
    const { gunzipSync } = await import(/* @vite-ignore */ zipModule);
    const bytes = await readFile(new URL("../../public/data/open-shops.json.gz", import.meta.url));
    text = gunzipSync(bytes).toString("utf8");
  } else {
    const response = await fetch("/data/open-shops.json.gz");
    text = await catalogResponseText(response);
  }
  const catalog = JSON.parse(text) as OpenCatalog;
  if (!Array.isArray(catalog.records) || !catalog.records.length) throw new Error("Open-data catalog is empty or invalid.");
  return catalog;
}
