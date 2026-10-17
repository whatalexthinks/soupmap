import Supercluster, { type PointFeature, type ClusterFeature, type AnyProps } from "supercluster";
import type { Shop } from "../data/shops.ts";

type Point = PointFeature<{ slug: string }>;
export type PinFeature = Point | ClusterFeature<AnyProps>;
export type MapBounds = [west: number, south: number, east: number, north: number];
export const MAX_PIN_ZOOM = 16;

/** Query just the viewport, including views crossing the date line. */
export function viewportBoxes(bounds?: MapBounds): MapBounds[] {
  if (!bounds) return [[-180, -90, 180, 90]];
  const [west, south, east, north] = bounds;
  return west <= east ? [bounds] : [[west, south, 180, north], [-180, south, east, north]];
}

/** Bounded map work; the searchable catalog is never truncated. */
export class ShopPinIndex {
  private readonly index: Supercluster<{ slug: string }>;
  private members = new Set<string>();
  private initialized = false;
  readonly limit: number;

  constructor(lowPower: boolean) {
    this.limit = lowPower ? 48 : 240;
    this.index = new Supercluster({
      radius: lowPower ? 72 : 56,
      // The coarser mobile root also bounds markers in a worldwide overview.
      extent: lowPower ? 256 : 512,
      maxZoom: MAX_PIN_ZOOM,
      minPoints: 2,
    });
  }

  setShops(shops: readonly Pick<Shop, "slug" | "lat" | "lng">[]): boolean {
    // Sorting results or saving a shop must not rebuild the spatial index.
    if (this.initialized && this.members.size === shops.length && shops.every(shop => this.members.has(shop.slug))) return false;
    this.members = new Set(shops.map(shop => shop.slug));
    this.index.load(shops.map(shop => ({
      type: "Feature",
      properties: { slug: shop.slug },
      geometry: { type: "Point", coordinates: [shop.lng, shop.lat] },
    })));
    this.initialized = true;
    return true;
  }

  query(bounds: MapBounds | undefined, zoom: number): PinFeature[] {
    const boxes = viewportBoxes(bounds);
    for (let level = Math.max(0, Math.min(MAX_PIN_ZOOM + 1, Math.floor(zoom))); level >= 0; level--) {
      const features = boxes.flatMap(box => this.index.getClusters(box, level));
      // Cluster more densely rather than dropping locations in crowded areas.
      if (features.length <= this.limit || level === 0) return features;
    }
    return [];
  }

  leaves(clusterId: number): Point[] {
    return this.index.getLeaves(clusterId, Infinity);
  }
}
