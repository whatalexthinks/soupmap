/**
 * Camera choreography: intro flyover, overview, city and shop framing.
 */
import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  EasingFunction,
  HeadingPitchRange,
  Math as CesiumMath,
  type Viewer,
} from "cesium";
import { cityByName, type City } from "../data/cities";
import type { Shop } from "../data/shops";

interface View {
  lng: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
}

/** High over the Pacific, looking north across the whole archipelago. */
export const OVERVIEW: View = { lng: 137.4, lat: 24.6, height: 2_300_000, heading: -6, pitch: -55 };
const INTRO_START: View = { lng: 136.6, lat: 17.0, height: 4_600_000, heading: -4, pitch: -50 };
/** South of central Tokyo, looking north over the city. */
const INTRO_END: View = { lng: 139.745, lat: 35.575, height: 9_000, heading: 6, pitch: -32 };

export const SHOP_PITCH = -35;
export const SHOP_RANGE = 600;
export const SHOP_DURATION = 3;

function viewToCamera(v: View) {
  return {
    destination: Cartesian3.fromDegrees(v.lng, v.lat, v.height),
    orientation: {
      heading: CesiumMath.toRadians(v.heading),
      pitch: CesiumMath.toRadians(v.pitch),
      roll: 0,
    },
  };
}

export class CameraDirector {
  constructor(
    private readonly viewer: Viewer,
    private readonly reducedMotion: boolean,
    /** Primitives to ignore when sampling the ground (our own pins). */
    private readonly excludeFromSampling: () => object[] = () => [],
  ) {}

  private duration(requested: number | undefined, fallback: number): number {
    return this.reducedMotion ? 0 : (requested ?? fallback);
  }

  setView(v: View): void {
    this.viewer.camera.setView(viewToCamera(v));
    this.viewer.scene.requestRender();
  }

  cancel(): void {
    this.viewer.camera.cancelFlight();
  }

  private flyTo(v: View, duration: number, extra: { maximumHeight?: number } = {}): Promise<void> {
    return new Promise((resolve) => {
      this.viewer.camera.flyTo({
        ...viewToCamera(v),
        duration,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
        complete: () => resolve(),
        cancel: () => resolve(),
        ...extra,
      });
    });
  }

  private flyToSphere(sphere: BoundingSphere, offset: HeadingPitchRange, duration: number): Promise<void> {
    return new Promise((resolve) => {
      this.viewer.camera.flyToBoundingSphere(sphere, {
        offset,
        duration,
        easingFunction: EasingFunction.QUADRATIC_IN_OUT,
        complete: () => resolve(),
        cancel: () => resolve(),
      });
    });
  }

  overview(duration?: number): Promise<void> {
    const d = this.duration(duration, 2.5);
    if (d === 0) {
      this.setView(OVERVIEW);
      return Promise.resolve();
    }
    return this.flyTo(OVERVIEW, d);
  }

  /** High over the archipelago, easing toward Tokyo. */
  async intro(): Promise<void> {
    if (this.reducedMotion) {
      this.setView(OVERVIEW);
      return;
    }
    this.setView(INTRO_START);
    await this.flyTo(INTRO_END, 9, { maximumHeight: INTRO_START.height });
  }

  city(city: City, duration?: number): Promise<void> {
    const center = Cartesian3.fromDegrees(city.lng, city.lat, city.groundHeight);
    return this.flyToSphere(
      new BoundingSphere(center, 500),
      new HeadingPitchRange(CesiumMath.toRadians(city.heading), CesiumMath.toRadians(-42), 6500),
      this.duration(duration, 3),
    );
  }

  sphere(sphere: BoundingSphere, duration?: number): Promise<void> {
    const range = Math.max(sphere.radius * 3.2, 3500);
    return this.flyToSphere(
      sphere,
      new HeadingPitchRange(0, CesiumMath.toRadians(-50), range),
      this.duration(duration, 2.5),
    );
  }

  /**
   * Three-quarter street view of a shop: flyToBoundingSphere with pitch ≈ -35°,
   * range ≈ 600 m, ≈ 3 s. We first aim at the city's rough ground height, then
   * nudge to the real surface once the tiles under the shop have rendered.
   *
   * `bottomInset` (0–1) is the share of the screen covered from below (the mobile
   * card). The camera keeps its position but tilts so the shop sits in the middle
   * of the part of the map that's still visible.
   */
  async shop(shop: Shop, duration?: number, bottomInset = 0): Promise<void> {
    const city = cityByName.get(shop.city);
    const heading = CesiumMath.toRadians(city?.heading ?? 0);
    const guess = city?.groundHeight ?? 40;
    await this.flyToSphere(
      ...this.shopFraming(shop, guess, heading, bottomInset),
      this.duration(duration, SHOP_DURATION),
    );

    // Only trust a sampled height inside a plausible band around the city's ground;
    // a bad depth readback must never send the camera underground.
    const actual = this.sampleGroundHeight(shop);
    if (actual !== undefined && actual > guess - 150 && actual < guess + 400 && Math.abs(actual - guess) > 20) {
      await this.flyToSphere(...this.shopFraming(shop, actual, heading, bottomInset), this.duration(undefined, 0.9));
    }
  }

  private shopFraming(shop: Shop, height: number, heading: number, bottomInset: number): [BoundingSphere, HeadingPitchRange] {
    const pitch = CesiumMath.toRadians(-SHOP_PITCH);
    // Angle between screen centre and the centre of the visible area above the inset.
    const canvas = this.viewer.scene.canvas;
    const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
    const fov = (this.viewer.camera.frustum as { fov?: number }).fov ?? CesiumMath.toRadians(60);
    const fovY = aspect >= 1 ? 2 * Math.atan(Math.tan(fov / 2) / aspect) : fov;
    const tilt = Math.atan(Math.min(Math.max(bottomInset, 0), 0.8) * Math.tan(fovY / 2));

    // Same camera position as the centred framing, looking at a point nearer the camera.
    const horizontal = SHOP_RANGE * Math.cos(pitch);
    const vertical = SHOP_RANGE * Math.sin(pitch);
    const steeper = pitch + tilt;
    const shift = horizontal - vertical / Math.tan(steeper);
    const metresPerDegLat = 111_320;
    const lat = shop.lat - (Math.cos(heading) * shift) / metresPerDegLat;
    const lng = shop.lng - (Math.sin(heading) * shift) / (metresPerDegLat * Math.cos(CesiumMath.toRadians(shop.lat)));

    return [
      new BoundingSphere(Cartesian3.fromDegrees(lng, lat, height), 25),
      new HeadingPitchRange(heading, -steeper, vertical / Math.sin(steeper)),
    ];
  }

  private sampleGroundHeight(shop: Shop): number | undefined {
    const scene = this.viewer.scene;
    if (!scene.sampleHeightSupported) return undefined;
    try {
      const h = scene.sampleHeight(Cartographic.fromDegrees(shop.lng, shop.lat), this.excludeFromSampling());
      return Number.isFinite(h) ? h : undefined;
    } catch {
      return undefined;
    }
  }
}
