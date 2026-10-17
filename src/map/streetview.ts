/// <reference types="google.maps" />
/**
 * Native Google Street View, with progressive imagery and connected street navigation.
 * The free Static metadata lookup is retained so selecting a shop doesn't load a
 * billable JavaScript panorama. Interactive imagery loads only after explicit entry.
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
interface MetadataResponse {
  status: string;
  pano_id?: string;
  location?: { lat: number; lng: number };
  copyright?: string;
  date?: string;
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
    const params = new URLSearchParams({
      location: `${shop.lat},${shop.lng}`, radius: "100", source: "outdoor", key: this.key,
    });
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Metadata failed");
      const data = await response.json() as MetadataResponse;
      if (data.status !== "OK" || !data.pano_id || !data.location) {
        this.errors.set(shop.slug, data.status === "REQUEST_DENIED"
          ? "Google denied the imagery check. Check Street View Static API, billing and website restrictions."
          : data.status === "OVER_QUERY_LIMIT" ? "Google's Street View request limit was reached. Try Google Maps."
          : "No outdoor Street View imagery was found within 100 m. Try Google Maps for nearby coverage.");
        return null;
      }
      return { panoId: data.pano_id, ...data.location, copyright: data.copyright ?? "© Google", date: data.date ?? null };
    } catch {
      this.errors.set(shop.slug, "The Street View availability check could not connect. Try the Google Maps link.");
      return null;
    }
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
      document.body.append(container);
      this.container = container;
      // Give Google's renderer its full viewport before creating it. Never scale a
      // low-resolution still or reuse the previous shop's zoom.
      const panorama = new library.StreetViewPanorama(container, {
        pano: info.panoId, pov: { heading: headingToShop(info, shop), pitch: 0 }, zoom: 0,
        visible: true, linksControl: true, clickToGo: true, scrollwheel: true,
        panControl: true, zoomControl: true, addressControl: true,
        fullscreenControl: false, enableCloseButton: false,
        motionTracking: false, motionTrackingControl: false,
      });
      this.panorama = panorama;
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
    this.opening = false;
    this.panorama?.setVisible(false);
    if (this.panorama && typeof google !== "undefined") google.maps.event.clearInstanceListeners(this.panorama);
    this.panorama = null;
    this.container?.remove();
    this.container = null;
  }
}
