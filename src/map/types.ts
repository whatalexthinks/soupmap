/**
 * The contract between the UI and the 3D map. Nothing here imports Cesium,
 * so the UI can load and run before (or without) the map chunk.
 */
import type { City } from "../data/cities";
import type { Shop } from "../data/shops";

export type MapMode = "google" | "fallback";
export type FallbackStyle = "photo" | "map";

export type EngineStatus =
  | { kind: "ready"; mode: MapMode; reason?: string }
  | { kind: "error"; message: string };

export interface FlyOptions {
  /** Seconds. Ignored (0) when the visitor prefers reduced motion. */
  duration?: number;
}

export interface MapEngine {
  readonly mode: MapMode;
  /** Shops currently passing the UI filters; pins and clusters follow this set. */
  setShops(shops: readonly Shop[]): void;
  /** Highlight a pin (or clear with null). */
  setSelected(slug: string | null): void;
  flyToShop(shop: Shop, options?: FlyOptions): Promise<void>;
  flyToCity(city: City, options?: FlyOptions): Promise<void>;
  flyToOverview(options?: FlyOptions): Promise<void>;
  /** Cinematic opening flight; resolves when it ends or is interrupted. */
  playIntro(): Promise<void>;
  cancelFlight(): void;
  setFallbackStyle(style: FallbackStyle): void;
  /** Called when a pin is clicked on the map. */
  onShopPicked(handler: (slug: string) => void): void;
  /** Called on the first user interaction with the map canvas. */
  onUserInteraction(handler: () => void): void;
}
