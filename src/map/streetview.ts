/// <reference types="google.maps" />
/**
 * Native Google Street View, with progressive imagery and connected street navigation.
 * Resolve official outdoor imagery through the same browser API as the viewer.
 * No Static API dependency; load the SDK only after explicit entry.
 */
import type { Shop } from "../data/shops.ts";
import { loadInteractiveStreetView } from "./google-loader.ts";

export interface PanoInfo {
  panoId: string;
  lat: number;
  lng: number;
  copyright: string;
  date: string | null;
}

export function headingToShop(from: {lat:number;lng:number}, to: {lat:number;lng:number}): number {
  const radians = Math.PI / 180;
  const lat1 = from.lat*radians, lat2 = to.lat*radians, delta = (to.lng-from.lng)*radians;
  return (Math.atan2(Math.sin(delta)*Math.cos(lat2),
    Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta))/radians+360)%360;
}

export class StreetView {
  private readonly errors = new Map<string, string>();
  private readonly cache = new Map<string, Promise<PanoInfo | null>>();
  private panorama: google.maps.StreetViewPanorama | null = null;
  private container: HTMLDivElement | null = null;
  private request = 0;
  private opening = false;
  private cancelReady: (() => void) | null = null;

  constructor(
    private readonly key: string,
    private readonly load = loadInteractiveStreetView,
  ) {}

  get isOpen(): boolean { return this.panorama !== null; }
  get isLoading(): boolean { return this.opening; }
  unavailableReason(shop: Shop): string | undefined { return this.errors.get(shop.slug); }

  find(shop: Shop): Promise<PanoInfo | null> {
    let pending = this.cache.get(shop.slug);
    if (!pending) {
      pending = this.lookup(shop).then(info => {
        if (!info) this.cache.delete(shop.slug);
        return info;
      });
      this.cache.set(shop.slug, pending);
    }
    return pending;
  }

  private async lookup(shop: Shop): Promise<PanoInfo | null> {
    this.errors.delete(shop.slug);
    try {
      const library = await this.load(this.key);
      const service = new library.StreetViewService();
      // A station-basement shop can resolve to an indoor passage even when Google
      // labels it outdoor. Prefer the best wider-area capture over the nearest.
      for (const radius of [250, 500]) {
        const result = await new Promise<google.maps.StreetViewResponse>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Street View lookup timed out")), 12000);
          void service.getPanorama({
            location: {lat: shop.lat, lng: shop.lng}, radius,
            sources: [library.StreetViewSource.GOOGLE, library.StreetViewSource.OUTDOOR],
            preference: library.StreetViewPreference.BEST,
          }).then(resolve, reject).finally(() => clearTimeout(timer));
        }).catch(error => {
          if ((error as {code?: string})?.code === "ZERO_RESULTS") return {data: {}} as google.maps.StreetViewResponse;
          throw error;
        });
        const data = result.data;
        const location = data?.location;
        if (location?.pano && location.latLng) {
          return {panoId: location.pano, lat: location.latLng.lat(), lng: location.latLng.lng(),
            copyright: data.copyright ?? "© Google", date: data.imageDate ?? null};
        }
      }
      this.errors.set(shop.slug, "No official outdoor Street View was found within 500 m. Try Google Maps for other imagery.");
    } catch {
      this.errors.set(shop.slug, "Street View could not connect. Check Maps JavaScript API access, billing and website restrictions, or try Google Maps.");
    }
    return null;
  }

  async open(shop: Shop): Promise<PanoInfo | null> {
    if (this.isOpen || this.opening) return null;
    this.opening = true;
    const request = ++this.request;
    try {
      const info = await this.find(shop);
      if (!info || request !== this.request) return null;
      const library = await this.load(this.key);
      if (request !== this.request) return null;
      const container = document.createElement("div");
      container.className = "interactive-streetview";
      container.setAttribute("aria-label", "Interactive Street View. Use arrows to move along connected streets.");
      // Google writes position:relative onto its host. Keep that host inside a
      // separate fixed frame so its inline styles cannot collapse the overlay.
      const renderer = document.createElement("div");
      renderer.className = "interactive-streetview__renderer";
      container.append(renderer);
      // Stay in the app's fixed stacking context, below its Back to map bar.
      (document.querySelector("#app") ?? document.body).append(container);
      this.container = container;
      // Give Google's renderer its full viewport before creating it. Never scale a
      // low-resolution still or reuse the previous shop's zoom.
      const panorama = new library.StreetViewPanorama(renderer, {
        pano: info.panoId, pov: { heading: headingToShop(info, shop), pitch: 0 }, zoom: 0,
        visible: true, linksControl: true, clickToGo: true, scrollwheel: true,
        panControl: true, zoomControl: true, addressControl: true,
        fullscreenControl: false, enableCloseButton: false,
        motionTracking: false, motionTrackingControl: false,
      });
      this.panorama = panorama;
      const ready = await new Promise<boolean>(resolve => {
        let listener: google.maps.MapsEventListener | undefined;
        const finish = (ok: boolean) => {
          clearTimeout(timer);
          listener?.remove();
          this.cancelReady = null;
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), 15000);
        this.cancelReady = () => finish(false);
        listener = panorama.addListener("status_changed", () => {
          const status = panorama.getStatus();
          if (status) finish(status === "OK");
        });
        if (panorama.getStatus()) finish(panorama.getStatus() === "OK");
      });
      if (request !== this.request) return null;
      if (!ready) {
        this.close();
        this.errors.set(shop.slug, "The street panorama did not load. Try again or open Street View in Google Maps.");
        return null;
      }
      panorama.addListener("status_changed", () => {
        if (request !== this.request) return;
        const status = panorama.getStatus();
        if (status && status !== "OK") {
          this.errors.set(shop.slug, "Google could not load this interactive panorama. Try the Google Maps link for other nearby imagery.");
          window.dispatchEvent(new Event("soupmap:streetview-error"));
        }
      });
      return info;
    } catch {
      if (request === this.request) {
        this.close();
        this.errors.set(shop.slug, "Interactive Street View needs Maps JavaScript API enabled and allowed on this key, active billing and the correct website restrictions. You can also open it in Google Maps.");
      }
      return null;
    } finally {
      if (request === this.request) this.opening = false;
    }
  }

  close(): void {
    ++this.request;
    this.cancelReady?.();
    this.opening = false;
    this.panorama?.setVisible(false);
    if (this.panorama && typeof google !== "undefined") google.maps.event.clearInstanceListeners(this.panorama);
    this.panorama = null;
    this.container?.remove();
    this.container = null;
  }
}
