/** Loaded only after opting into history. No live third-party queries or imagery. */
import { z } from "zod";
import { distanceMeters } from "./discovery.ts";
import { isTokyoHistoryLocation } from "./history-coverage.ts";

const httpsUrl = z.url().refine(value => new URL(value).protocol === "https:", "HTTPS required");
const text = z.string().trim().min(1);
const sourceSchema = z.object({
  id: text,
  title: text,
  url: httpsUrl,
  provider: z.enum(["wikidata", "wikipedia", "japan-search", "official"]),
  license: text,
  licenseUrl: httpsUrl,
  attribution: text,
  usage: z.enum(["facts", "adapted-text", "discovery"]),
}).strict();
const placeSchema = z.object({
  id: text,
  nameEn: text,
  nameJa: text,
  kind: z.enum(["landmark", "neighbourhood"]),
  lat: z.number().finite(),
  lng: z.number().finite(),
  summary: text.max(750),
  summarySourceIds: z.array(text).min(1),
  dates: z.array(z.object({
    label: text,
    // Null is intentional: never fill a missing historical fact from a building model.
    value: text.nullable(),
    sourceIds: z.array(text),
  }).strict()).max(8),
  sources: z.array(sourceSchema).min(1).max(10),
  verifiedOn: z.iso.date(),
}).strict().superRefine((place, context) => {
  const ids = new Set(place.sources.map(source => source.id));
  if (ids.size !== place.sources.length || !isTokyoHistoryLocation(place)) {
    context.addIssue({ code: "custom", message: "Duplicate sources or invalid pilot coordinates" });
  }
  const evidence = (id: string) => place.sources.some(source => source.id === id && source.usage !== "discovery");
  if (place.summarySourceIds.some(id => !evidence(id))
      || place.dates.some(date => (date.value !== null && !date.sourceIds.length) || date.sourceIds.some(id => !evidence(id)))) {
    context.addIssue({ code: "custom", message: "Every known fact must cite evidence, not discovery links" });
  }
  if (place.sources.some(source => source.provider === "wikipedia"
      && (source.usage !== "adapted-text" || source.license !== "CC BY-SA 4.0"))) {
    context.addIssue({ code: "custom", message: "Wikipedia adaptations require share-alike attribution" });
  }
});
export const historyDatasetSchema = z.object({
  city: z.literal("Tokyo"),
  places: z.array(placeSchema).min(1).max(60),
}).strict().superRefine((data, context) => {
  if (new Set(data.places.map(place => place.id)).size !== data.places.length) {
    context.addIssue({ code: "custom", message: "Duplicate history place IDs" });
  }
});

export type HistoryDataset = z.infer<typeof historyDatasetSchema>;
export type HistoryPlace = HistoryDataset["places"][number];
export type HistorySource = HistoryPlace["sources"][number];
export interface NearbyHistory { place: HistoryPlace; distanceMeters: number }

export const HISTORY_RADIUS_METERS = 2500;
export const HISTORY_LIMIT = 4;

/** Single-flight, bounded city snapshot; failures are not cached so Retry works. */
export function createHistoryLoader(fetcher: typeof fetch) {
  let pending: Promise<HistoryDataset> | undefined;
  return (): Promise<HistoryDataset> => {
    if (pending) return pending;
    pending = (async () => {
      const response = await fetcher("/data/history/tokyo-v1.json", { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`History snapshot unavailable (${response.status})`);
      const body = await response.text();
      if (body.length > 100_000) throw new Error("History snapshot exceeds phone data budget");
      return historyDatasetSchema.parse(JSON.parse(body));
    })().catch(error => { pending = undefined; throw error; });
    return pending;
  };
}

export const loadTokyoHistory = createHistoryLoader((...args) => fetch(...args));

/** Neighbourhood coordinates are representative points, not precise historic boundaries. */
export function nearbyHistory(dataset: HistoryDataset, location: { lat: number; lng: number }): NearbyHistory[] {
  if (!isTokyoHistoryLocation(location)) return [];
  return dataset.places
    .map(place => ({ place, distanceMeters: distanceMeters(location, place) }))
    .filter(entry => entry.distanceMeters <= HISTORY_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.place.id.localeCompare(b.place.id))
    .slice(0, HISTORY_LIMIT);
}
