import { z } from "zod";
import { shopBySlug } from "../src/data/shops.ts";

const shop = z.string().refine(s => shopBySlug.has(s));
const visit = z.object({
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {
    const date = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0,10) === s && s >= "1900-01-01" && +date <= Date.now()+86400000;
  }),
  bowl:z.string().max(120), note:z.string().max(400), wouldReturn:z.boolean(),
}).strict();
const trip = z.object({
  id:z.string().regex(/^[a-z0-9-]{1,40}$/), name:z.string().min(1).max(80),
  area:z.string().max(60),areaLabel:z.string().max(60),created:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days:z.array(z.object({title:z.string().max(80),stops:z.array(shop).min(1).max(8)}).strict()).min(1).max(7),
  listId:z.string().max(40).optional(),
}).strict();
export const entryKind = z.enum(["visit","trip","recipe","draft"]);
export const entryKey = z.string().regex(/^[a-z0-9][a-z0-9-]{0,159}$/);
export function validEntry(kind: string, key: string, value: unknown, recipes: ReadonlySet<string>): boolean {
  if (!entryKey.safeParse(key).success) return false;
  if (kind === "visit") return shopBySlug.has(key) && visit.safeParse(value).success;
  if (kind === "trip") return trip.safeParse(value).success && (value as {id:string}).id === key;
  if (kind === "recipe") return recipes.has(key) && z.object({saved:z.boolean(),note:z.string().max(2000)}).strict().safeParse(value).success;
  if (kind === "draft") return key === "community" && z.object({
    shop:z.string().max(160),city:z.string().max(80),kind:z.string().max(40),body:z.string().max(4000),
    author:z.string().max(120),date:z.string().max(10),placeName:z.string().max(200),mapUrl:z.string().max(1000),
  }).strict().safeParse(value).success;
  return false;
}
