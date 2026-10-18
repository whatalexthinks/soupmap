/**
 * The shop data model. Validated with Zod at build time (scripts/validate-shops.ts).
 * The app imports only the inferred types, so Zod never ships to the browser.
 */
import { z } from "zod";
import { BROTH_IDS } from "./broths.ts";

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase-kebab-case");

export const PhotoSchema = z
  .strictObject({
    url: z.string().nullable(),
    credit: z.string().nullable(),
    license: z.string().nullable(),
  })
  .refine((p) => !p.url || (p.credit && p.license), {
    message: "photo.url needs a visible credit and a license",
  });

export const ShopSchema = z.strictObject({
  slug,
  name: z.string().min(1),
  nameJa: z.string().min(1),
  /** Generated phonetic reading, not an official English translation. */
  nameRomanized: z.string().min(1).optional(),
  /** "brand": nameRomanized starts with the chain's own English name. */
  nameSource: z.enum(["brand"]).optional(),
  cuisine: z.enum(["ramen", "udon", "soba", "oden", "other"]).optional(),
  city: z.string().min(1),
  /** 5-digit Japanese municipality code (ward code inside designated cities). Finds the PLATEAU tileset. */
  cityCode: z.string().regex(/^\d{5}$/),
  neighborhood: z.string().min(1),
  /** English place name for the locality, e.g. "Chuo, Osaka" (open-data records). */
  localityRomanized: z.string().min(1).optional(),
  /** English prefecture name, derived from the source address or postcode. */
  prefecture: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  broth: z.enum(BROTH_IDS),
  /** "name": the broth is suggested by the shop's own name, not checked on a menu. */
  brothSource: z.enum(["name"]).optional(),
  /** Style tags suggested by the shop's name (src/data/styles.ts). */
  styles: z.array(z.string().min(1)).optional(),
  /** Brand name shared by many catalog locations. */
  chain: z.string().min(1).optional(),
  signatureBowl: z.string().min(1),
  priceYen: z
    .tuple([z.number().int().positive(), z.number().int().positive()])
    .refine(([lo, hi]) => lo <= hi, { message: "priceYen must be [low, high]" })
    .nullable(),
  hours: z.string().min(1).nullable(),
  /** One or two sentences, written by us. */
  blurb: z.string().min(20).max(320),
  videoUrl: z.url().nullable(),
  photo: PhotoSchema,
  /**
   * .spz / .ply / .splat / .ksplat / .sog: an absolute URL (e.g. Cloudflare R2) or a site-relative path.
   * "procedural:ramen-bowl" renders the built-in placeholder scene (no external asset).
   */
  splatUrl: z.string().min(1).nullable(),
  googleMapsUrl: z.url(),
  /** Contact details copied from the source record (open data); never typed in by hand. */
  address: z.string().min(1).max(160).optional(),
  postcode: z.string().regex(/^\d{3}-\d{4}$/).optional(),
  phone: z.string().regex(/^\+81\d{9,10}$/).optional(),
  website: z.url({ protocol: /^https?$/ }).optional(),
  socials: z.array(z.url({ protocol: /^https?$/ })).max(3).optional(),
  dataSource: z.enum(["manual", "overture", "osm"]),
  /** ID in the upstream dataset (Overture GERS ID / OSM element), for provenance. */
  sourceId: z.string().min(1).nullable().optional(),
  sourceLicenses: z.array(z.string().min(1)).optional(),
  verified: z.boolean(),
});

export const ShopsSchema = z.array(ShopSchema).min(1);

export type Shop = z.infer<typeof ShopSchema>;
export type DataSource = Shop["dataSource"];
