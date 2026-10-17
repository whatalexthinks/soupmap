/**
 * "Stand outside": the nearest Google Street View panorama at a shop, rendered inside
 * Cesium with GoogleStreetViewCubeMapPanoramaProvider + CubeMapPanorama (CesiumJS ≥ 1.139).
 *
 * - Availability uses the Street View metadata endpoint (no charge) with source=outdoor,
 *   which returns Google's own street imagery only (no user PhotoSpheres).
 * - Opening a panorama loads six cube faces = six Street View Static API requests.
 * - Any failure hides the button; nothing is shown as an error.
 */
import {
  Cartesian3,
  Cartographic,
  GoogleStreetViewCubeMapPanoramaProvider,
  HeadingPitchRange,
  Math as CesiumMath,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type CubeMapPanorama,
  type PerspectiveFrustum,
} from "cesium";
import type { Shop } from "../data/shops.ts";
import type { MapEngineImpl } from "./engine.ts";

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

const METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
const SEARCH_RADIUS_M = 100;
const MIN_FOV = CesiumMath.toRadians(20);
const MAX_FOV = CesiumMath.toRadians(100);

/** Initial compass bearing from the panorama to the shop, so you face the door. */
function bearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const φ1 = CesiumMath.toRadians(fromLat);
  const φ2 = CesiumMath.toRadians(toLat);
  const Δλ = CesiumMath.toRadians(toLng - fromLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return Math.atan2(y, x);
}

interface ActiveView {
  panorama: CubeMapPanorama;
  handler: ScreenSpaceEventHandler;
  saved: { position: Cartesian3; heading: number; pitch: number; roll: number; fov: number | undefined };
  globeShown: boolean;
}

export class StreetView {
  private readonly errors = new Map<string, string>();
  private readonly cache = new Map<string, Promise<PanoInfo | null>>();
  private provider: Promise<GoogleStreetViewCubeMapPanoramaProvider> | undefined;
  private active: ActiveView | null = null;

  constructor(
    private readonly engine: MapEngineImpl,
    private readonly key: string,
  ) {}

  get isOpen(): boolean {
    return this.active !== null;
  }

  unavailableReason(shop: Shop): string | undefined {
    return this.errors.get(shop.slug);
  }

  /** Nearest outdoor panorama within 100 m. Cache successful imagery only. */
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
      location: `${shop.lat},${shop.lng}`,
      radius: String(SEARCH_RADIUS_M),
      source: "outdoor",
      key: this.key,
    });
    try {
      const response = await fetch(`${METADATA_URL}?${params}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) {
        this.errors.set(shop.slug, "Google's imagery check failed. Try Street View in Google Maps.");
        return null;
      }
      const data = (await response.json()) as MetadataResponse;
      if (data.status !== "OK" || !data.pano_id || !data.location) {
        this.errors.set(shop.slug, data.status === "REQUEST_DENIED"
          ? "Google denied Street View access. Check Street View Static API, billing and website restrictions for this key."
          : data.status === "OVER_QUERY_LIMIT" ? "Google's Street View request limit was reached. Try Google Maps."
          : "No outdoor Street View imagery was found within 100 m. Try Google Maps for nearby coverage.");
        return null;
      }
      return {
        panoId: data.pano_id,
        lat: data.location.lat,
        lng: data.location.lng,
        copyright: data.copyright ?? "© Google",
        date: data.date ?? null,
      };
    } catch {
      this.errors.set(shop.slug, "The Street View availability check could not connect. Try the Google Maps link.");
      return null;
    }
  }

  async open(shop: Shop): Promise<PanoInfo | null> {
    const info = await this.find(shop);
    if (!info || this.active) return null;
    try {
      this.provider ??= GoogleStreetViewCubeMapPanoramaProvider.fromUrl({ key: this.key });
      const provider = await this.provider;
      const panorama = await provider.loadPanorama({
        cartographic: Cartographic.fromDegrees(info.lng, info.lat, 0),
        panoId: info.panoId,
      });
      this.enter(panorama, info, shop);
      return info;
    } catch (error) {
      this.provider = undefined;
      this.errors.set(shop.slug, "The panorama could not load. Check Map Tiles API access or use Street View in Google Maps.");
      console.warn("[soupmap] Street View panorama failed to load");
      return null;
    }
  }

  private enter(panorama: CubeMapPanorama, info: PanoInfo, shop: Shop): void {
    const { viewer, pins } = this.engine;
    const scene = viewer.scene;
    const camera = viewer.camera;
    const frustum = camera.frustum as PerspectiveFrustum;

    const saved = {
      position: Cartesian3.clone(camera.positionWC),
      heading: camera.heading,
      pitch: camera.pitch,
      roll: camera.roll,
      fov: frustum.fov,
    };
    const globeShown = scene.globe.show;

    camera.cancelFlight();
    scene.primitives.add(panorama);
    scene.globe.show = false;
    if (this.engine.googleTileset) this.engine.googleTileset.show = false;
    pins.setVisible(false);

    camera.lookAt(
      Cartesian3.fromDegrees(info.lng, info.lat, 2),
      new HeadingPitchRange(bearing(info.lat, info.lng, shop.lat, shop.lng), 0, 2),
    );
    const controller = scene.screenSpaceCameraController;
    controller.enableZoom = false;
    controller.enableTranslate = false;

    // Mouse wheel narrows/widens the field of view, like zooming a real panorama.
    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((delta: number) => {
      const fov = (frustum.fov ?? CesiumMath.toRadians(60)) * (delta < 0 ? 1.05 : 0.95);
      frustum.fov = CesiumMath.clamp(fov, MIN_FOV, MAX_FOV);
      scene.requestRender();
    }, ScreenSpaceEventType.WHEEL);

    this.active = { panorama, handler, saved, globeShown };
    scene.requestRender();
  }

  close(): void {
    const active = this.active;
    if (!active) return;
    this.active = null;
    const { viewer, pins } = this.engine;
    const scene = viewer.scene;
    const camera = viewer.camera;

    active.handler.destroy();
    scene.primitives.remove(active.panorama);
    camera.lookAtTransform(Matrix4.IDENTITY);
    if (active.saved.fov !== undefined) (camera.frustum as PerspectiveFrustum).fov = active.saved.fov;
    camera.setView({
      destination: active.saved.position,
      orientation: { heading: active.saved.heading, pitch: active.saved.pitch, roll: active.saved.roll },
    });
    const controller = scene.screenSpaceCameraController;
    controller.enableZoom = true;
    controller.enableTranslate = true;
    scene.globe.show = active.globeShown;
    if (this.engine.googleTileset) this.engine.googleTileset.show = true;
    pins.setVisible(true);
    scene.requestRender();
  }
}
